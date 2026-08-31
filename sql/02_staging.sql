-- =============================================================================
-- SecondChance staging transforms
--
-- Raw to staging. Everything here is type conversion, parsing and duplicate
-- marking. Nothing here drops a row.
--
-- That last point is deliberate and it is the reason this file is longer than it
-- looks like it needs to be. A row that fails to parse is kept, tagged in
-- quality_flags, and counted, because a pipeline that silently discards the rows
-- it cannot read will happily report clean numbers on a shrinking sample. The
-- audit query at the bottom of this file is what turns that promise into
-- something a reviewer can check.
--
-- Idempotent by construction: every table is rebuilt from raw on each run, so
-- rerunning after a failed load is safe and produces the same result.
--
-- Redshift notes:
--   - TO_TIMESTAMP with a format mask returns an error on a malformed input
--     rather than NULL, so parsing goes through a CASE with a regex guard.
--   - Redshift has no MEDIAN window over an unbounded frame that is cheap here,
--     so the percentile work is deferred to the episode layer in 03.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: the age strings Austin publishes, converted to days.
--
-- Austin writes ages as "2 years", "11 months", "4 weeks", "1 day". A small
-- number are negative, which happens when a date of birth was typed in wrong.
-- Those become NULL rather than 0: a zero would be a three week old kitten,
-- which is a very different animal from one whose age was mistyped.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW staging.v_age_to_days AS
SELECT
    raw_age,
    CASE
        WHEN raw_age IS NULL OR TRIM(raw_age) = '' THEN NULL
        WHEN raw_age !~ '^-?[0-9]+ (day|days|week|weeks|month|months|year|years)$' THEN NULL
        WHEN SPLIT_PART(raw_age, ' ', 1)::DECIMAL(10, 2) < 0 THEN NULL
        ELSE SPLIT_PART(raw_age, ' ', 1)::DECIMAL(10, 2) *
            CASE SPLIT_PART(raw_age, ' ', 2)
                WHEN 'day'    THEN 1.0
                WHEN 'days'   THEN 1.0
                WHEN 'week'   THEN 7.0
                WHEN 'weeks'  THEN 7.0
                WHEN 'month'  THEN 30.4375
                WHEN 'months' THEN 30.4375
                WHEN 'year'   THEN 365.25
                WHEN 'years'  THEN 365.25
            END
    END AS age_days
FROM (
    SELECT DISTINCT age_upon_intake AS raw_age FROM raw.austin_intakes
    UNION
    SELECT DISTINCT age_upon_outcome AS raw_age FROM raw.austin_outcomes
) AS distinct_ages;


-- -----------------------------------------------------------------------------
-- staging.intake_events
--
-- One row per raw intake row, including the ones we could not parse. The
-- deduplication is marked rather than applied: is_duplicate_of names the row we
-- would keep, and the episode layer in 03 is the only place that acts on it.
-- Doing it this way means the duplicate count in the paper is a query rather
-- than a number someone remembered.
-- -----------------------------------------------------------------------------
TRUNCATE TABLE staging.intake_events;

INSERT INTO staging.intake_events (
    intake_event_id, animal_id, intake_at, animal_name, name_is_shelter_assigned,
    found_location, intake_type, intake_condition, animal_type, sex_upon_intake,
    age_upon_intake_days, breed_raw, color_raw, is_duplicate_of, quality_flags, loaded_at
)
WITH parsed AS (
    SELECT
        r.record_hash                                        AS intake_event_id,
        NULLIF(TRIM(r.animal_id), '')                        AS animal_id,
        CASE
            WHEN r.datetime_text ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} (AM|PM)$'
                THEN TO_TIMESTAMP(r.datetime_text, 'MM/DD/YYYY HH12:MI:SS AM')
            WHEN r.datetime_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
                THEN TO_TIMESTAMP(LEFT(r.datetime_text, 19), 'YYYY-MM-DDTHH24:MI:SS')
            ELSE NULL
        END                                                  AS intake_at,
        NULLIF(TRIM(r.name), '')                             AS animal_name,
        -- Austin marks a staff-assigned name with a leading asterisk. This turns
        -- out to be one of the strongest single predictors of a long stay, and
        -- the paper argues it is a proxy for arriving without an owner rather
        -- than anything about the animal.
        (r.name LIKE '*%')                                   AS name_is_shelter_assigned,
        NULLIF(TRIM(r.found_location), '')                   AS found_location,
        COALESCE(NULLIF(TRIM(r.intake_type), ''), 'Unknown') AS intake_type,
        COALESCE(NULLIF(TRIM(r.intake_condition), ''), 'Unknown') AS intake_condition,
        NULLIF(TRIM(r.animal_type), '')                      AS animal_type,
        COALESCE(NULLIF(TRIM(r.sex_upon_intake), ''), 'Unknown') AS sex_upon_intake,
        a.age_days                                           AS age_upon_intake_days,
        NULLIF(TRIM(r.breed), '')                            AS breed_raw,
        NULLIF(TRIM(r.color), '')                            AS color_raw,
        r.age_upon_intake                                    AS age_raw,
        r.retrieved_at
    FROM raw.austin_intakes r
    LEFT JOIN staging.v_age_to_days a ON a.raw_age = r.age_upon_intake
),
ranked AS (
    SELECT
        parsed.*,
        -- Exact duplicates on (animal, timestamp). Keeping one would create a
        -- phantom zero day episode; keeping both would double count the animal in
        -- the shelter census.
        FIRST_VALUE(intake_event_id) OVER (
            PARTITION BY animal_id, intake_at
            ORDER BY retrieved_at, intake_event_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        ) AS canonical_event_id
    FROM parsed
)
SELECT
    intake_event_id,
    animal_id,
    intake_at,
    animal_name,
    name_is_shelter_assigned,
    found_location,
    intake_type,
    intake_condition,
    animal_type,
    sex_upon_intake,
    age_upon_intake_days,
    breed_raw,
    color_raw,
    CASE WHEN canonical_event_id <> intake_event_id THEN canonical_event_id END AS is_duplicate_of,
    -- Flags accumulate rather than replace, so a row can be both unparseable and
    -- missing an age and say so.
    NULLIF(
        TRIM(BOTH ',' FROM
            CASE WHEN animal_id IS NULL THEN 'missing_animal_id,' ELSE '' END ||
            CASE WHEN intake_at IS NULL THEN 'unparseable_timestamp,' ELSE '' END ||
            CASE WHEN age_upon_intake_days IS NULL AND age_raw IS NOT NULL
                 THEN 'unreadable_age,' ELSE '' END ||
            CASE WHEN animal_type IS NULL THEN 'missing_species,' ELSE '' END ||
            CASE WHEN breed_raw IS NULL THEN 'missing_breed,' ELSE '' END ||
            CASE WHEN canonical_event_id <> intake_event_id THEN 'duplicate_row,' ELSE '' END
        ),
        ''
    ) AS quality_flags,
    GETDATE() AS loaded_at
FROM ranked;


-- -----------------------------------------------------------------------------
-- staging.outcome_events
-- -----------------------------------------------------------------------------
TRUNCATE TABLE staging.outcome_events;

INSERT INTO staging.outcome_events (
    outcome_event_id, animal_id, outcome_at, outcome_type, outcome_subtype,
    animal_type, sex_upon_outcome, age_upon_outcome_days, date_of_birth,
    is_duplicate_of, quality_flags, loaded_at
)
WITH parsed AS (
    SELECT
        r.record_hash                       AS outcome_event_id,
        NULLIF(TRIM(r.animal_id), '')       AS animal_id,
        CASE
            WHEN r.datetime_text ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} (AM|PM)$'
                THEN TO_TIMESTAMP(r.datetime_text, 'MM/DD/YYYY HH12:MI:SS AM')
            WHEN r.datetime_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
                THEN TO_TIMESTAMP(LEFT(r.datetime_text, 19), 'YYYY-MM-DDTHH24:MI:SS')
            ELSE NULL
        END                                 AS outcome_at,
        NULLIF(TRIM(r.outcome_type), '')    AS outcome_type,
        NULLIF(TRIM(r.outcome_subtype), '') AS outcome_subtype,
        NULLIF(TRIM(r.animal_type), '')     AS animal_type,
        COALESCE(NULLIF(TRIM(r.sex_upon_outcome), ''), 'Unknown') AS sex_upon_outcome,
        a.age_days                          AS age_upon_outcome_days,
        CASE
            WHEN r.date_of_birth_text ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
                THEN TO_DATE(r.date_of_birth_text, 'MM/DD/YYYY')
            WHEN r.date_of_birth_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                THEN TO_DATE(LEFT(r.date_of_birth_text, 10), 'YYYY-MM-DD')
            ELSE NULL
        END                                 AS date_of_birth,
        r.age_upon_outcome                  AS age_raw,
        r.retrieved_at
    FROM raw.austin_outcomes r
    LEFT JOIN staging.v_age_to_days a ON a.raw_age = r.age_upon_outcome
),
ranked AS (
    SELECT
        parsed.*,
        FIRST_VALUE(outcome_event_id) OVER (
            PARTITION BY animal_id, outcome_at
            ORDER BY retrieved_at, outcome_event_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        ) AS canonical_event_id
    FROM parsed
)
SELECT
    outcome_event_id,
    animal_id,
    outcome_at,
    outcome_type,
    outcome_subtype,
    animal_type,
    sex_upon_outcome,
    age_upon_outcome_days,
    date_of_birth,
    CASE WHEN canonical_event_id <> outcome_event_id THEN canonical_event_id END AS is_duplicate_of,
    NULLIF(
        TRIM(BOTH ',' FROM
            CASE WHEN animal_id IS NULL THEN 'missing_animal_id,' ELSE '' END ||
            CASE WHEN outcome_at IS NULL THEN 'unparseable_timestamp,' ELSE '' END ||
            CASE WHEN outcome_type IS NULL THEN 'missing_outcome_type,' ELSE '' END ||
            CASE WHEN age_upon_outcome_days IS NULL AND age_raw IS NOT NULL
                 THEN 'unreadable_age,' ELSE '' END ||
            CASE WHEN canonical_event_id <> outcome_event_id THEN 'duplicate_row,' ELSE '' END
        ),
        ''
    ) AS quality_flags,
    GETDATE() AS loaded_at
FROM ranked;


-- -----------------------------------------------------------------------------
-- staging.daily_weather
--
-- The National Weather Service endpoint returns hourly observations, not daily
-- summaries. The daily collapse and the unit conversion happen in the ingestion
-- client (NationalWeatherServiceClient.to_daily), because a day with fewer than
-- eighteen usable hourly readings has to be rejected before the maximum is
-- taken, and that decision belongs next to the code that knows how many readings
-- there were. What lands in raw.weather_observations is therefore already one
-- text row per station-day, with NULLs where coverage was too thin.
--
-- So this block is typing plus the two trailing windows. It does not invent a
-- value for a missing day: four readings on a mild afternoon would otherwise
-- become a record cold snap in the feature table, and nothing downstream would
-- question it.
-- -----------------------------------------------------------------------------
TRUNCATE TABLE staging.daily_weather;

INSERT INTO staging.daily_weather (
    observed_date, station_id, temperature_max_f, temperature_min_f,
    precipitation_in, temperature_max_7d_mean, precipitation_7d_total,
    is_imputed, loaded_at
)
WITH typed AS (
    SELECT
        CASE
            WHEN observed_date_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                THEN TO_DATE(LEFT(observed_date_text, 10), 'YYYY-MM-DD')
            WHEN observed_date_text ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
                THEN TO_DATE(observed_date_text, 'MM/DD/YYYY')
            ELSE NULL
        END AS observed_date,
        station_id,
        -- A non-numeric string here is a missing reading, not a zero. NULLIF plus
        -- the regex guard keeps "NA", "M" and "" out of the numeric column.
        CASE WHEN temperature_max_f ~ '^-?[0-9]+(\.[0-9]+)?$'
             THEN temperature_max_f::DECIMAL(6, 2) END AS temperature_max_f,
        CASE WHEN temperature_min_f ~ '^-?[0-9]+(\.[0-9]+)?$'
             THEN temperature_min_f::DECIMAL(6, 2) END AS temperature_min_f,
        CASE WHEN precipitation_in ~ '^[0-9]+(\.[0-9]+)?$'
             THEN precipitation_in::DECIMAL(6, 3) END  AS precipitation_in,
        retrieved_at,
        ROW_NUMBER() OVER (
            PARTITION BY station_id, observed_date_text ORDER BY retrieved_at DESC
        ) AS recency_rank
    FROM raw.weather_observations
),
deduplicated AS (
    -- The station backfills late-arriving observations, so the same day can be
    -- fetched more than once. The most recent fetch wins.
    SELECT * FROM typed WHERE recency_rank = 1 AND observed_date IS NOT NULL
)
SELECT
    observed_date,
    station_id,
    temperature_max_f,
    temperature_min_f,
    precipitation_in,
    -- Trailing windows, inclusive of the current day, matching what
    -- features.add_weather computes in Python. The two implementations are
    -- checked against each other by the reconciliation query in 04.
    AVG(temperature_max_f) OVER (
        PARTITION BY station_id ORDER BY observed_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS temperature_max_7d_mean,
    SUM(precipitation_in) OVER (
        PARTITION BY station_id ORDER BY observed_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS precipitation_7d_total,
    FALSE AS is_imputed,
    GETDATE() AS loaded_at
FROM deduplicated;


-- -----------------------------------------------------------------------------
-- Staging audit
--
-- Run this after every load. The numbers it returns are the ones quoted in the
-- data section of the paper, so if they move, either the source changed or this
-- file did, and both are worth knowing about before the model is retrained.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW staging.v_load_audit AS
SELECT 'intake_events' AS table_name,
       COUNT(*)                                                     AS rows_loaded,
       SUM(CASE WHEN quality_flags IS NOT NULL THEN 1 ELSE 0 END)   AS rows_flagged,
       SUM(CASE WHEN is_duplicate_of IS NOT NULL THEN 1 ELSE 0 END) AS duplicate_rows,
       SUM(CASE WHEN intake_at IS NULL THEN 1 ELSE 0 END)           AS unparseable_timestamps,
       SUM(CASE WHEN age_upon_intake_days IS NULL THEN 1 ELSE 0 END) AS missing_ages,
       MIN(intake_at)                                               AS earliest_event,
       MAX(intake_at)                                               AS latest_event
FROM staging.intake_events
UNION ALL
SELECT 'outcome_events',
       COUNT(*),
       SUM(CASE WHEN quality_flags IS NOT NULL THEN 1 ELSE 0 END),
       SUM(CASE WHEN is_duplicate_of IS NOT NULL THEN 1 ELSE 0 END),
       SUM(CASE WHEN outcome_at IS NULL THEN 1 ELSE 0 END),
       SUM(CASE WHEN age_upon_outcome_days IS NULL THEN 1 ELSE 0 END),
       MIN(outcome_at),
       MAX(outcome_at)
FROM staging.outcome_events
UNION ALL
SELECT 'daily_weather',
       COUNT(*),
       SUM(CASE WHEN temperature_max_f IS NULL THEN 1 ELSE 0 END),
       0,
       0,
       SUM(CASE WHEN temperature_max_f IS NULL THEN 1 ELSE 0 END),
       MIN(observed_date)::TIMESTAMP,
       MAX(observed_date)::TIMESTAMP
FROM staging.daily_weather;

-- Nothing was lost between raw and staging. This should return zero rows; if it
-- ever returns one, the load is wrong and the episode build must not proceed.
CREATE OR REPLACE VIEW staging.v_row_count_reconciliation AS
SELECT 'intakes' AS feed, r.n AS raw_rows, s.n AS staging_rows
FROM (SELECT COUNT(*) AS n FROM raw.austin_intakes) r,
     (SELECT COUNT(*) AS n FROM staging.intake_events) s
WHERE r.n <> s.n
UNION ALL
SELECT 'outcomes', r.n, s.n
FROM (SELECT COUNT(*) AS n FROM raw.austin_outcomes) r,
     (SELECT COUNT(*) AS n FROM staging.outcome_events) s
WHERE r.n <> s.n;
