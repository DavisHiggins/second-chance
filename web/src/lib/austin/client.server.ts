import "server-only";

import { unstable_cache } from "next/cache";
import { logEvent } from "@/lib/observability.server";
import type { DatasetRef } from "./datasets";
import { SOCRATA_DOMAIN } from "./datasets";

/**
 * Server-side access to the Socrata SODA API.
 *
 * Everything about this module exists so the browser never talks to Austin
 * directly. The feeds are tens of thousands of rows; shipping them to the
 * client would be slow, would embed the whole dataset in the page payload,
 * and would put the app token (if one is set) in front of the user.
 *
 * The token is optional. Austin serves these datasets anonymously at a lower
 * rate limit, which is enough for an hourly refresh; the token only buys a
 * private throttling pool. It is read from a server-only variable and sent as
 * X-App-Token. It must never be given a NEXT_PUBLIC_ prefix.
 */

/** Austin refreshes the current feeds hourly, so there is nothing to gain from
 *  asking more often than that. */
export const CURRENT_FEED_TTL_SECONDS = 3600;

/** SODA 2.0 caps a single page at 50,000 rows. Both current feeds are below
 *  that today, but paging is implemented properly so growth cannot silently
 *  truncate a dataset the way a bare $limit would. */
const PAGE_SIZE = 50_000;
const MAX_PAGES = 40;

const MAX_ATTEMPTS = 4;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class SocrataError extends Error {
  readonly status: number | null;
  readonly datasetId: string;

  constructor(message: string, datasetId: string, status: number | null) {
    super(message);
    this.name = "SocrataError";
    this.datasetId = datasetId;
    this.status = status;
  }
}

export interface FetchResult {
  rows: unknown[];
  /** Wall-clock time the fetch completed, for provenance. */
  retrievedAt: string;
  /** Pages actually requested, so truncation is visible in logs. */
  pages: number;
  datasetId: string;
}

function appToken(): string | undefined {
  const token = process.env.SOCRATA_APP_TOKEN;
  return token && token.trim().length > 0 ? token.trim() : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter, so a burst of serverless invocations does
 *  not retry in lockstep and re-create the spike that caused the 429. */
function backoffDelay(attempt: number): number {
  const base = Math.min(250 * 2 ** attempt, 4000);
  return base + Math.random() * 250;
}

async function requestPage(
  dataset: DatasetRef,
  select: readonly string[],
  offset: number,
  where: string | undefined,
): Promise<unknown[]> {
  const url = new URL(`https://${SOCRATA_DOMAIN}/resource/${dataset.id}.json`);
  url.searchParams.set("$select", select.join(","));
  url.searchParams.set("$order", dataset.orderColumn);
  url.searchParams.set("$limit", String(PAGE_SIZE));
  url.searchParams.set("$offset", String(offset));
  if (where) url.searchParams.set("$where", where);

  const headers: Record<string, string> = { accept: "application/json" };
  const token = appToken();
  if (token) headers["X-App-Token"] = token;

  let lastError: SocrataError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(backoffDelay(attempt));

    let response: Response;
    try {
      response = await fetch(url, { headers, cache: "no-store" });
    } catch (cause) {
      lastError = new SocrataError(
        `network failure for ${dataset.id}: ${String(cause)}`,
        dataset.id,
        null,
      );
      continue;
    }

    if (response.ok) {
      const body: unknown = await response.json();
      if (!Array.isArray(body)) {
        throw new SocrataError(`expected an array from ${dataset.id}`, dataset.id, response.status);
      }
      return body;
    }

    lastError = new SocrataError(
      `${dataset.id} returned ${response.status}`,
      dataset.id,
      response.status,
    );

    // A 4xx that is not rate limiting will not fix itself, so fail immediately
    // rather than burning three more round trips on a bad query.
    if (!RETRYABLE_STATUS.has(response.status)) break;
  }

  throw lastError ?? new SocrataError(`failed to fetch ${dataset.id}`, dataset.id, null);
}

/**
 * Fetches every row of a dataset, following pages until one comes back short.
 *
 * `$order` is always set to a stable column so a row cannot appear on two
 * pages or fall between them while paging.
 */
async function fetchAllPages(
  dataset: DatasetRef,
  select: readonly string[],
  where?: string,
): Promise<FetchResult> {
  const startedAt = Date.now();
  const rows: unknown[] = [];
  let pages = 0;

  for (let offset = 0; pages < MAX_PAGES; offset += PAGE_SIZE) {
    const page = await requestPage(dataset, select, offset, where);
    pages += 1;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (pages >= MAX_PAGES) {
    throw new SocrataError(
      `${dataset.id} exceeded ${MAX_PAGES} pages, refusing to serve a truncated dataset`,
      dataset.id,
      null,
    );
  }

  const result = {
    rows,
    retrievedAt: new Date().toISOString(),
    pages,
    datasetId: dataset.id,
  };

  // Logged on every real network read, so a truncated or shrinking feed is
  // visible in the deployment logs rather than only in the UI. A row count
  // that lands exactly on a page boundary is the signature of a silent cap.
  logEvent("austin.dataset.fetched", {
    dataset: dataset.id,
    label: dataset.label,
    rows: rows.length,
    pages,
    pageSize: PAGE_SIZE,
    elapsedMs: Date.now() - startedAt,
    retrievedAt: result.retrievedAt,
    tokenConfigured: appToken() !== undefined,
  });

  return result;
}

/**
 * Coalesces concurrent identical fetches within a single server instance.
 *
 * `unstable_cache` deduplicates across requests once a value is cached, but
 * several requests arriving during a cold revalidate would each start their
 * own download. This map means the first one wins and the rest await it.
 */
const inFlight = new Map<string, Promise<FetchResult>>();

function dedupe(key: string, run: () => Promise<FetchResult>): Promise<FetchResult> {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = run().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

/**
 * A per-process copy of the last successful read, with the same TTL.
 *
 * Next's data cache refuses any entry over 2MB, and a full current feed is
 * several times that, so `unstable_cache` silently declines to store these
 * results. Without this layer every regenerating route would re-download both
 * feeds. Keeping the value in the module means the six routes that regenerate
 * on the same hourly tick, inside the same instance, share one download.
 *
 * It is a cache, not a fallback: entries expire on the same schedule and a
 * failed fetch never resurrects a stale one, because serving old rows as
 * though they were current is the exact failure this rewrite exists to remove.
 */
interface ProcessCacheEntry {
  value: FetchResult;
  expiresAt: number;
}

const processCache = new Map<string, ProcessCacheEntry>();

/**
 * Cached full-dataset read.
 *
 * The cache key includes the dataset id and the selected columns, so
 * repointing a dataset by environment variable cannot serve the previous
 * rows out of cache.
 */
export async function fetchDataset(
  dataset: DatasetRef,
  select: readonly string[],
  options: { ttlSeconds?: number; where?: string } = {},
): Promise<FetchResult> {
  const ttl = options.ttlSeconds ?? CURRENT_FEED_TTL_SECONDS;
  const key = `austin:${dataset.id}:${select.join(",")}:${options.where ?? ""}`;

  const fresh = processCache.get(key);
  if (fresh && fresh.expiresAt > Date.now()) return fresh.value;

  const cached = unstable_cache(
    () => dedupe(key, () => fetchAllPages(dataset, select, options.where)),
    [key],
    { revalidate: ttl, tags: [`austin:${dataset.id}`] },
  );

  const value = await cached();
  processCache.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  return value;
}

/**
 * A single aggregate query, for cheap summaries that would otherwise require
 * downloading a whole dataset. Used against the archive, where a full pull is
 * 347,000 rows and belongs in the offline ETL rather than a page request.
 */
export async function fetchAggregate(
  dataset: DatasetRef,
  soql: Record<string, string>,
  ttlSeconds = 86_400,
): Promise<unknown[]> {
  const key = `austin-agg:${dataset.id}:${JSON.stringify(soql)}`;

  const cached = unstable_cache(
    async () => {
      const url = new URL(`https://${SOCRATA_DOMAIN}/resource/${dataset.id}.json`);
      for (const [param, value] of Object.entries(soql)) url.searchParams.set(param, value);

      const headers: Record<string, string> = { accept: "application/json" };
      const token = appToken();
      if (token) headers["X-App-Token"] = token;

      const response = await fetch(url, { headers, cache: "no-store" });
      if (!response.ok) {
        throw new SocrataError(
          `${dataset.id} aggregate returned ${response.status}`,
          dataset.id,
          response.status,
        );
      }
      const body: unknown = await response.json();
      if (!Array.isArray(body)) {
        throw new SocrataError(`expected an array from ${dataset.id}`, dataset.id, response.status);
      }
      return body;
    },
    [key],
    { revalidate: ttlSeconds, tags: [`austin:${dataset.id}`] },
  );

  return cached();
}

/** True when a token is configured. Surfaced in diagnostics only; the value
 *  itself never leaves the server. */
export function hasAppToken(): boolean {
  return appToken() !== undefined;
}
