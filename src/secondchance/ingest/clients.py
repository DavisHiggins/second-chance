"""HTTP clients for the four public data sources.

Every client here follows the same three rules, learned the hard way:

1. Retry on the errors that are worth retrying (429, 5xx, timeouts) with
   exponential backoff and jitter, and never on the ones that are not (400, 401,
   404). Blind retries on a malformed request just make the same mistake five
   times.
2. Page explicitly. Socrata's default page size is 1,000 rows, so a naive request
   against a 170,000 row dataset silently returns the first thousand and looks
   like it worked. That failure mode is quiet and expensive.
3. Return the raw payload alongside the parsed rows. The landing zone stores what
   the API actually said, not our interpretation of it.

None of these APIs requires a key to work. Socrata and RescueGroups both behave
much better with one, and the runbook explains how to get both.
"""

from __future__ import annotations

import json
import logging
import random
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

log = logging.getLogger(__name__)

USER_AGENT = "SecondChance/1.0 (UNC Charlotte DTSC 3601 student project; contact davishiggins1@gmail.com)"
RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}
MAX_ATTEMPTS = 5


@dataclass
class FetchResult:
    """One API response plus everything needed to reproduce it later."""

    url: str
    status: int
    rows: list[dict[str, Any]]
    raw_body: bytes
    retrieved_at: datetime
    attempt_count: int
    headers: dict[str, str] = field(default_factory=dict)


class ApiError(RuntimeError):
    """Raised when a request fails in a way retrying will not fix."""


def _request(url: str, headers: dict[str, str] | None = None, timeout: int = 60) -> FetchResult:
    """GET a URL with backoff, returning the parsed body and the raw bytes."""
    merged = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    merged.update(headers or {})

    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        request = urllib.request.Request(url, headers=merged)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read()
                parsed = json.loads(body) if body else []
                rows = parsed if isinstance(parsed, list) else [parsed]
                return FetchResult(
                    url=url,
                    status=response.status,
                    rows=rows,
                    raw_body=body,
                    retrieved_at=datetime.now(UTC),
                    attempt_count=attempt,
                    headers=dict(response.headers),
                )
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code not in RETRYABLE_STATUS:
                raise ApiError(f"{url} returned {error.code}: {error.reason}") from error
            log.warning("Attempt %d/%d for %s failed with %d", attempt, MAX_ATTEMPTS, url, error.code)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            log.warning("Attempt %d/%d for %s failed: %s", attempt, MAX_ATTEMPTS, url, error)

        if attempt < MAX_ATTEMPTS:
            # Exponential backoff with full jitter. The jitter matters when several
            # ingestion Lambdas wake on the same cron minute and would otherwise
            # retry in lockstep.
            delay = min(2 ** attempt, 30) * (0.5 + random.random() / 2)
            time.sleep(delay)

    raise ApiError(f"{url} failed after {MAX_ATTEMPTS} attempts: {last_error}")


class SocrataClient:
    """Client for the City of Austin open data portal.

    Austin publishes the shelter feeds through Socrata, which speaks SoQL: a small
    SQL dialect passed as query parameters. We use ``$where`` for incremental
    pulls and ``$order`` plus ``$offset`` for paging.

    A subtle trap: paging without ``$order`` is undefined. Socrata makes no
    guarantee about row order between requests, so an unordered offset scan can
    return the same row twice and miss another. We always order by the source
    ``:id`` system column, which is stable.
    """

    def __init__(
        self,
        domain: str = "data.austintexas.gov",
        app_token: str | None = None,
        page_size: int = 50_000,
    ) -> None:
        """Configure the portal host, the optional app token and the page size.

        Args:
            domain: the Socrata host, without a scheme.
            app_token: optional token. Requests work without one but are rate
                limited far more aggressively.
            page_size: rows per request. Socrata's own ceiling is 50,000.
        """
        self.domain = domain
        self.app_token = app_token
        self.page_size = page_size

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.app_token:
            headers["X-App-Token"] = self.app_token
        return headers

    def fetch_all(
        self,
        dataset_id: str,
        since: datetime | None = None,
        timestamp_column: str = "datetime",
        max_pages: int = 200,
    ) -> Iterator[FetchResult]:
        """Yield one FetchResult per page until the dataset is exhausted.

        Args:
            dataset_id: the Socrata four by four, for example ``wter-evkm``.
            since: only rows with ``timestamp_column`` at or after this moment.
                Pass the previous run's high water mark for an incremental pull.
            timestamp_column: the field to filter on.
            max_pages: a hard stop so a bad filter cannot spin forever.
        """
        offset = 0
        for page in range(max_pages):
            params: dict[str, Any] = {
                "$limit": self.page_size,
                "$offset": offset,
                "$order": ":id",
            }
            if since is not None:
                # Socrata floating timestamps have no zone, so send a naive
                # ISO 8601 string rather than one ending in Z.
                stamp = since.replace(tzinfo=None).isoformat(timespec="seconds")
                params["$where"] = f"{timestamp_column} >= '{stamp}'"

            url = f"https://{self.domain}/resource/{dataset_id}.json?" + urllib.parse.urlencode(params)
            result = _request(url, self._headers())
            log.info(
                "Socrata %s page %d: %d rows (offset %d)",
                dataset_id,
                page,
                len(result.rows),
                offset,
            )
            if not result.rows:
                return
            yield result
            if len(result.rows) < self.page_size:
                return
            offset += self.page_size

        log.warning("Stopped paging %s at max_pages=%d", dataset_id, max_pages)

    def row_count(self, dataset_id: str) -> int:
        """Ask the API how many rows exist, so the loader can verify the pull."""
        url = f"https://{self.domain}/resource/{dataset_id}.json?$select=count(*) as n"
        result = _request(url, self._headers())
        return int(result.rows[0]["n"]) if result.rows else 0


class NationalWeatherServiceClient:
    """Client for api.weather.gov.

    The NWS API needs no key, but it will reject a request that does not send a
    User-Agent identifying the caller. Their documentation asks for a contact
    address, which is what the module level USER_AGENT provides.

    One thing worth knowing before relying on this feed: the observations endpoint
    returns hourly observations, not daily summaries, and individual fields are
    frequently null. Daily maxima and minima have to be derived, and a day with
    fewer than eighteen usable hours should be treated as missing rather than
    averaged from four readings.
    """

    def __init__(self, station_id: str = "KATT", user_agent: str | None = None) -> None:
        """Configure the observing station and the identifying User-Agent.

        Args:
            station_id: NWS station identifier. KATT is Austin Executive Airport.
            user_agent: overrides the module default. NWS rejects requests that do
                not identify their caller, so this is not optional in practice.
        """
        self.station_id = station_id
        self.user_agent = user_agent or USER_AGENT

    def _headers(self) -> dict[str, str]:
        return {"User-Agent": self.user_agent, "Accept": "application/geo+json"}

    def observations(self, start: date, end: date) -> FetchResult:
        """Hourly observations between two dates, inclusive of the start."""
        params = {
            "start": f"{start.isoformat()}T00:00:00Z",
            "end": f"{end.isoformat()}T23:59:59Z",
            "limit": 1000,
        }
        url = (
            f"https://api.weather.gov/stations/{self.station_id}/observations?"
            + urllib.parse.urlencode(params)
        )
        return _request(url, self._headers())

    @staticmethod
    def to_daily(
        observations: list[dict[str, Any]], min_hours: int = 18
    ) -> list[dict[str, Any]]:
        """Collapse hourly GeoJSON features into daily max, min and precipitation.

        Temperatures arrive in Celsius and precipitation in millimetres. The rest
        of the project works in Fahrenheit and inches because that is what Austin
        staff and the source station report, so the conversion happens here, once.
        """
        buckets: dict[str, dict[str, list[float]]] = {}
        for feature in observations:
            properties = feature.get("properties", feature)
            timestamp = properties.get("timestamp")
            if not timestamp:
                continue
            day = timestamp[:10]
            slot = buckets.setdefault(day, {"temp": [], "precip": []})
            temperature = (properties.get("temperature") or {}).get("value")
            if temperature is not None:
                slot["temp"].append(float(temperature))
            precipitation = (properties.get("precipitationLastHour") or {}).get("value")
            if precipitation is not None:
                slot["precip"].append(float(precipitation))

        daily: list[dict[str, Any]] = []
        for day, slot in sorted(buckets.items()):
            if len(slot["temp"]) < min_hours:
                # Not enough coverage to call this a daily maximum honestly.
                daily.append(
                    {
                        "observed_date": day,
                        "temperature_max_f": None,
                        "temperature_min_f": None,
                        "precipitation_in": None,
                        "hours_observed": len(slot["temp"]),
                        "sufficient_coverage": False,
                    }
                )
                continue
            daily.append(
                {
                    "observed_date": day,
                    "temperature_max_f": round(max(slot["temp"]) * 9 / 5 + 32, 2),
                    "temperature_min_f": round(min(slot["temp"]) * 9 / 5 + 32, 2),
                    "precipitation_in": round(sum(slot["precip"]) / 25.4, 3),
                    "hours_observed": len(slot["temp"]),
                    "sufficient_coverage": True,
                }
            )
        return daily


class RescueGroupsClient:
    """Client for the RescueGroups.org v5 adoptable pet API.

    Used for the public discovery page and for regional context: knowing that
    forty other Austin area organisations are currently listing shepherd mixes is
    useful when deciding how hard this one will be to place.

    The v5 API is JSON:API, so filters go in a POST body rather than the query
    string, and related records (organisation, breeds, locations) come back in a
    top level ``included`` array that has to be joined by id.
    """

    BASE_URL = "https://api.rescuegroups.org/v5/public"

    def __init__(self, api_key: str, page_limit: int = 100) -> None:
        """Store the API key and page size, refusing an empty key.

        Args:
            api_key: a RescueGroups v5 key. Required; the API has no anonymous tier.
            page_limit: records per page, capped at 100 by the API itself.

        Raises:
            ValueError: if no key was supplied. Failing here beats failing on the
                first 401 in production.
        """
        if not api_key:
            raise ValueError("RescueGroups requires an API key; request one from their portal")
        self.api_key = api_key
        self.page_limit = page_limit

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": self.api_key,
            "Content-Type": "application/vnd.api+json",
            "User-Agent": USER_AGENT,
        }

    def search_available(
        self, postal_code: str = "78702", radius_miles: int = 50, max_pages: int = 20
    ) -> Iterator[FetchResult]:
        """Yield pages of currently adoptable animals near a postal code."""
        for page in range(1, max_pages + 1):
            body = json.dumps(
                {
                    "data": {
                        "filterRadius": {"miles": radius_miles, "postalcode": postal_code},
                        "filters": [
                            {
                                "fieldName": "animals.statusObjectID",
                                "operation": "equal",
                                "criteria": "1",  # available
                            }
                        ],
                    }
                }
            ).encode("utf-8")
            url = f"{self.BASE_URL}/animals/search/available/?limit={self.page_limit}&page={page}"

            request = urllib.request.Request(url, data=body, headers=self._headers(), method="POST")
            for attempt in range(1, MAX_ATTEMPTS + 1):
                try:
                    with urllib.request.urlopen(request, timeout=60) as response:
                        raw = response.read()
                        payload = json.loads(raw)
                        rows = payload.get("data", [])
                        result = FetchResult(
                            url=url,
                            status=response.status,
                            rows=rows,
                            raw_body=raw,
                            retrieved_at=datetime.now(UTC),
                            attempt_count=attempt,
                            headers=dict(response.headers),
                        )
                        break
                except urllib.error.HTTPError as error:
                    if error.code not in RETRYABLE_STATUS or attempt == MAX_ATTEMPTS:
                        raise ApiError(f"RescueGroups returned {error.code}") from error
                    time.sleep(min(2 ** attempt, 30) * (0.5 + random.random() / 2))
            else:  # pragma: no cover - loop always breaks or raises
                return

            if not result.rows:
                return
            yield result
            if len(result.rows) < self.page_limit:
                return
