import "server-only";

/**
 * The one place this product is allowed to write to the console.
 *
 * `no-console` is on across the codebase, and it should be: a stray log in a
 * component ends up in the browser bundle. Server-side observability is a real
 * requirement though, so it goes through here, in a `server-only` module with
 * a single scoped lint exception, rather than by relaxing the rule everywhere.
 *
 * Events are emitted as one line of JSON with a stable `event` name so a log
 * drain can filter on them. Nothing here may carry a field the product does
 * not already treat as public: no app token, no found address, no raw source
 * row.
 */

export type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: "info" | "error", event: string, fields: LogFields): void {
  const line = JSON.stringify({ event, ...fields });
  // eslint-disable-next-line no-console
  if (level === "error") console.error(line);
  // eslint-disable-next-line no-console
  else console.info(line);
}

/** A normal, expected occurrence worth being able to count later. */
export function logEvent(event: string, fields: LogFields): void {
  emit("info", event, fields);
}

/**
 * A failure. The cause is reduced to a message rather than logged whole,
 * because an Error from `fetch` can carry request details that have no
 * business in a log drain.
 */
export function logFailure(event: string, fields: LogFields, cause?: unknown): void {
  emit("error", event, {
    ...fields,
    cause: cause instanceof Error ? `${cause.name}: ${cause.message}` : cause ? String(cause) : null,
  });
}
