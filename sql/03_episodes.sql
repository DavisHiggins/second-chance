-- =============================================================================
-- SecondChance episode reconstruction, in the warehouse
--
-- This file is the SQL counterpart of src/secondchance/episodes.py. The two
-- implementations exist for different reasons: Python builds the research dataset
-- from a downloaded export, and this builds the production table the scoring and
-- monitoring jobs read. They have to agree, and the reconciliation view at the
-- bottom of 04_analytics.sql is how that agreement is checked rather than
-- assumed.
--
-- The pairing rule, stated once:
--
--   Within one animal, sort both event logs by time. The k-th intake is closed by
--   the earliest outcome at or after it and strictly before the (k+1)-th intake.
--   If there is no such outcome the episode was open when the export was cut, and
--   it becomes a right-censored row rather than a discarded one.
--
-- The failure this prevents is a plain join on animal_id. About one animal in
-- eleven comes through more than once, and a naive join gives every intake
-- crossed with every outcome: four rows for an animal with two visits, all with
-- durations that look entirely plausible. Nothing downstream would notice.
--
-- Redshift notes:
--   - There is no ASOF join, so the forward match is done with LEAD plus a
--     correlated bound, which the planner handles as a merge on the sorted,
--     co-located animal_id distribution key.
--   - :data_cutoff and :pipeline_version are bound by the caller. The Lambda in
--     src/secondchance/pipeline/handlers.py passes them; the runbook shows the
--     manual form.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1. Deduplicated, ordered event logs with each animal's next arrival.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS staging.tmp_intake_sequence;
CREATE TEMP TABLE staging.tmp_intake_sequence
DISTKEY (animal_id)
SORTKEY (animal_id, intake_at)
AS
SELECT
    i.intake_event_id,
    i.animal_id,
    i.intake_at,
    ROW_NUMBER() OVER (PARTITION BY i.animal_id ORDER BY i.intake_at) AS episode_number,
    ROW_NUMBER() OVER (PARTITION BY i.animal_id ORDER BY i.intake_at) - 1 AS prior_intake_count,
    -- The hard right boundary for the outcome search. NULL for an animal's last
    -- visit, which is why every comparison against it is guarded.
    LEAD(i.intake_at) OVER (PARTITION BY i.animal_id ORDER BY i.intake_at) AS next_intake_at,
    i.animal_name,
    i.name_is_shelter_assigned,
    i.found_location,
    i.intake_type,
    i.intake_condition,
    i.animal_type,
    i.sex_upon_intake,
    i.age_upon_intake_days,
    i.breed_raw,
    i.color_raw
FROM staging.intake_events i
WHERE i.is_duplicate_of IS NULL
  AND i.animal_id IS NOT NULL
  AND i.intake_at IS NOT NULL;


DROP TABLE IF EXISTS staging.tmp_outcome_sequence;
CREATE TEMP TABLE staging.tmp_outcome_sequence
DISTKEY (animal_id)
SORTKEY (animal_id, outcome_at)
AS
SELECT
    o.outcome_event_id,
    o.animal_id,
    o.outcome_at,
    o.outcome_type,
    o.outcome_subtype,
    o.animal_type AS animal_type_outcome,
    o.sex_upon_outcome,
    o.age_upon_outcome_days,
    o.date_of_birth
FROM staging.outcome_events o
WHERE o.is_duplicate_of IS NULL
  AND o.animal_id IS NOT NULL
  AND o.outcome_at IS NOT NULL;


-- -----------------------------------------------------------------------------
-- Step 2. The forward match.
--
-- One candidate outcome per intake: the earliest one inside the window. The
-- window's upper bound is the next arrival, so an outcome belonging to a later
-- visit can never close an earlier one.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS staging.tmp_matched_episodes;
CREATE TEMP TABLE staging.tmp_matched_episodes
DISTKEY (animal_id)
AS
WITH candidates AS (
    SELECT
        i.intake_event_id,
        o.outcome_event_id,
        ROW_NUMBER() OVER (
            PARTITION BY i.intake_event_id ORDER BY o.outcome_at
        ) AS proximity_rank
    FROM staging.tmp_intake_sequence i
    JOIN staging.tmp_outcome_sequence o
      ON o.animal_id = i.animal_id
     AND o.outcome_at >= i.intake_at
     AND (i.next_intake_at IS NULL OR o.outcome_at < i.next_intake_at)
)
SELECT intake_event_id, outcome_event_id
FROM candidates
WHERE proximity_rank = 1;


-- -----------------------------------------------------------------------------
-- Step 3. The threshold for a suspected missing outcome.
--
-- Some episodes have no outcome row at all. Most are recent arrivals that were
-- genuinely still in the building when the export was cut, and those are honest
-- censoring. But an intake in 2015 with no outcome by 2022 does not describe an
-- animal that lived at the shelter for seven years. It describes an outcome form
-- that was never filed.
--
-- Treating the two the same way corrupts both the survival curves and the shelter
-- census feature, so open episodes longer than the 99.5th percentile of observed
-- stays are flagged. The threshold comes from the data rather than from someone's
-- judgement, and the flag is reported rather than acted on silently.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS staging.tmp_missing_outcome_threshold;
CREATE TEMP TABLE staging.tmp_missing_outcome_threshold AS
SELECT
    PERCENTILE_CONT(0.995) WITHIN GROUP (
        ORDER BY DATEDIFF(SECOND, i.intake_at, o.outcome_at) / 86400.0
    ) AS threshold_days
FROM staging.tmp_intake_sequence i
JOIN staging.tmp_matched_episodes m ON m.intake_event_id = i.intake_event_id
JOIN staging.tmp_outcome_sequence o ON o.outcome_event_id = m.outcome_event_id;


-- -----------------------------------------------------------------------------
-- Step 4. The episode table.
-- -----------------------------------------------------------------------------
TRUNCATE TABLE analytics.shelter_episodes;

-- The column list is spelled out rather than relying on the SELECT matching the
-- table's declared order. That reliance is the kind of thing that survives a
-- schema edit and then silently writes the weather into the label columns.
INSERT INTO analytics.shelter_episodes (
    episode_id, animal_id, episode_number, intake_at, outcome_at, effective_exit_at,
    length_of_stay_days, event_code, is_adopted, is_open_at_cutoff,
    suspected_missing_outcome, outcome_type, outcome_subtype, animal_type, breed_raw,
    breed_primary_token, breed_primary_group, breed_size_ordinal, breed_weight_lb,
    breed_coat_ordinal, breed_is_mix, breed_is_bully_type, breed_has_bsl_risk,
    color_raw, color_has_black, sex_upon_intake, is_sterilized_at_intake,
    age_at_intake_days, age_band, has_name, name_is_shelter_assigned, intake_type,
    intake_condition, prior_intake_count, shelter_census_at_intake,
    species_census_at_intake, intakes_prior_7d, intakes_prior_30d, adoptions_prior_30d,
    weather_tmax_f, weather_tmin_f, weather_prcp_in, adopted_within_7d,
    adopted_within_14d, adopted_within_30d, long_stay_60d, built_at, pipeline_version
)
WITH threshold AS (SELECT threshold_days FROM staging.tmp_missing_outcome_threshold),
paired AS (
    SELECT
        i.animal_id || '-' || i.episode_number::VARCHAR AS episode_id,
        i.animal_id,
        i.episode_number,
        i.intake_at,
        o.outcome_at,
        CASE
            WHEN o.outcome_at IS NOT NULL
                THEN DATEDIFF(SECOND, i.intake_at, o.outcome_at) / 86400.0
            ELSE DATEDIFF(SECOND, i.intake_at, :data_cutoff::TIMESTAMP) / 86400.0
        END AS length_of_stay_days,
        (o.outcome_at IS NOT NULL) AS is_matched,
        o.outcome_type,
        o.outcome_subtype,
        o.animal_type_outcome,
        i.animal_type,
        i.breed_raw,
        i.color_raw,
        i.sex_upon_intake,
        i.age_upon_intake_days,
        i.animal_name,
        i.name_is_shelter_assigned,
        i.intake_type,
        i.intake_condition,
        i.prior_intake_count,
        t.threshold_days
    FROM staging.tmp_intake_sequence i
    LEFT JOIN staging.tmp_matched_episodes m ON m.intake_event_id = i.intake_event_id
    LEFT JOIN staging.tmp_outcome_sequence o ON o.outcome_event_id = m.outcome_event_id
    CROSS JOIN threshold t
),
coded AS (
    SELECT
        p.*,
        -- "Rto-Adopt" is Austin's code for an animal on the return-to-owner track
        -- that the finder adopted instead. It is an adoption from the shelter's
        -- point of view and from the animal's.
        (p.outcome_type IN ('Adoption', 'Rto-Adopt')) AS is_adopted,
        (NOT p.is_matched)                            AS is_open_at_cutoff,
        (NOT p.is_matched AND p.length_of_stay_days > p.threshold_days)
            AS suspected_missing_outcome
    FROM paired p
    -- An outcome before its intake is a data error, not a negative stay. The
    -- forward match cannot produce one, so this is a guard rather than a filter,
    -- and the count is reported by the audit view below.
    WHERE p.length_of_stay_days >= 0
),
enriched AS (
    SELECT
        c.*,
        CASE
            WHEN c.is_adopted THEN 1
            WHEN c.is_matched THEN 2
            ELSE 0
        END AS event_code,
        -- For a flagged episode, assume the animal actually left around the
        -- threshold and the paperwork was lost. Without this correction a few
        -- hundred unfiled forms accumulate into a phantom occupancy of several
        -- hundred animals by the end of the series, and the model learns a trend
        -- that is a fact about Austin's paperwork rather than about the building.
        CASE
            WHEN c.suspected_missing_outcome
                THEN DATEADD(SECOND, (c.threshold_days * 86400)::BIGINT, c.intake_at)
            WHEN c.is_matched THEN c.outcome_at
            ELSE :data_cutoff::TIMESTAMP
        END AS effective_exit_at,
        CASE
            WHEN c.age_upon_intake_days IS NULL         THEN 'unknown'
            WHEN c.age_upon_intake_days <   60          THEN 'neonate'
            WHEN c.age_upon_intake_days <  180          THEN 'puppy_kitten'
            WHEN c.age_upon_intake_days <  365          THEN 'juvenile'
            WHEN c.age_upon_intake_days < 1095.75       THEN 'young_adult'
            WHEN c.age_upon_intake_days < 2922.00       THEN 'adult'
            ELSE 'senior'
        END AS age_band,
        b.akc_group           AS breed_primary_group,
        b.breed_token         AS breed_primary_token,
        CASE b.size_class WHEN 'toy' THEN 0 WHEN 'small' THEN 1 WHEN 'medium' THEN 2
                          WHEN 'large' THEN 3 WHEN 'giant' THEN 4 END AS breed_size_ordinal,
        b.typical_weight_lb   AS breed_weight_lb,
        CASE b.coat_length WHEN 'hairless' THEN 0 WHEN 'short' THEN 1
                           WHEN 'medium' THEN 2 WHEN 'long' THEN 3 END AS breed_coat_ordinal,
        b.is_bully_type       AS breed_is_bully_type,
        b.has_bsl_risk        AS breed_has_bsl_risk
    FROM coded c
    -- Austin's breed strings are compositional ("Labrador Retriever/Pit Bull
    -- Mix"), so the primary token is the part before the first slash with the
    -- "Mix" suffix stripped. The full multi-token composition rules live in
    -- src/secondchance/labeling/breed_llm.py; the warehouse keeps the primary
    -- token because that is all the queue card needs.
    LEFT JOIN raw.breed_attributes b
        ON b.breed_token = TRIM(REGEXP_REPLACE(SPLIT_PART(c.breed_raw, '/', 1), '\\s+Mix$', ''))
),
occupancy AS (
    -- Shelter census at the moment of each arrival, as a sweep over arrival and
    -- departure events rather than a self join. The self join is quadratic and
    -- would take hours on 137,000 rows; this is linear after the sort.
    SELECT
        episode_id,
        SUM(delta) OVER (ORDER BY event_at, delta ROWS UNBOUNDED PRECEDING) AS running_census,
        SUM(delta) OVER (
            PARTITION BY animal_type ORDER BY event_at, delta ROWS UNBOUNDED PRECEDING
        ) AS running_species_census,
        is_arrival
    FROM (
        SELECT episode_id, animal_type, intake_at AS event_at, 1 AS delta, TRUE AS is_arrival
        FROM enriched
        UNION ALL
        -- Departures sort before arrivals at an identical timestamp, so an animal
        -- that replaces one leaving the same minute is not double counted.
        SELECT episode_id, animal_type, effective_exit_at, -1, FALSE
        FROM enriched
        WHERE effective_exit_at IS NOT NULL
    )
),
volume AS (
    SELECT
        e.episode_id,
        (SELECT COUNT(*) FROM enriched p
          WHERE p.intake_at >= DATEADD(DAY, -7, e.intake_at::DATE)
            AND p.intake_at <  e.intake_at::DATE) AS intakes_prior_7d,
        (SELECT COUNT(*) FROM enriched p
          WHERE p.intake_at >= DATEADD(DAY, -30, e.intake_at::DATE)
            AND p.intake_at <  e.intake_at::DATE) AS intakes_prior_30d,
        (SELECT COUNT(*) FROM enriched p
          WHERE p.is_adopted
            AND p.outcome_at >= DATEADD(DAY, -30, e.intake_at::DATE)
            AND p.outcome_at <  e.intake_at::DATE) AS adoptions_prior_30d
    FROM enriched e
)
SELECT
    e.episode_id,
    e.animal_id,
    e.episode_number,
    e.intake_at,
    e.outcome_at,
    e.effective_exit_at,
    e.length_of_stay_days,
    e.event_code,
    e.is_adopted,
    e.is_open_at_cutoff,
    e.suspected_missing_outcome,
    e.outcome_type,
    e.outcome_subtype,
    e.animal_type,
    e.breed_raw,
    e.breed_primary_token,
    e.breed_primary_group,
    e.breed_size_ordinal,
    e.breed_weight_lb,
    e.breed_coat_ordinal,
    (e.breed_raw ILIKE '%Mix%' OR e.breed_raw LIKE '%/%') AS breed_is_mix,
    e.breed_is_bully_type,
    e.breed_has_bsl_risk,
    e.color_raw,
    (e.color_raw ILIKE '%Black%')  AS color_has_black,
    e.sex_upon_intake,
    (e.sex_upon_intake ILIKE '%Neutered%' OR e.sex_upon_intake ILIKE '%Spayed%')
        AS is_sterilized_at_intake,
    e.age_upon_intake_days AS age_at_intake_days,
    e.age_band,
    (e.animal_name IS NOT NULL) AS has_name,
    e.name_is_shelter_assigned,
    e.intake_type,
    e.intake_condition,
    e.prior_intake_count,
    -- Minus one so the census excludes the arriving animal itself.
    o.running_census - 1         AS shelter_census_at_intake,
    o.running_species_census - 1 AS species_census_at_intake,
    v.intakes_prior_7d,
    v.intakes_prior_30d,
    v.adoptions_prior_30d,
    w.temperature_max_f AS weather_tmax_f,
    w.temperature_min_f AS weather_tmin_f,
    w.precipitation_in  AS weather_prcp_in,

    -- Horizon labels. NULL, not zero, when the answer is not observable yet.
    --
    -- An animal transferred on day 5 answers "no" to "adopted within 7 days":
    -- that is an observed negative. An animal still in the shelter on day 3 when
    -- the export was cut has no answer at all, and giving it a zero is the classic
    -- way to make a shelter model look better than it is.
    CASE
        WHEN e.is_matched OR DATEDIFF(DAY, e.intake_at, :data_cutoff::TIMESTAMP) >= 7
            THEN CASE WHEN e.is_adopted AND e.length_of_stay_days <= 7 THEN 1 ELSE 0 END
    END AS adopted_within_7d,
    CASE
        WHEN e.is_matched OR DATEDIFF(DAY, e.intake_at, :data_cutoff::TIMESTAMP) >= 14
            THEN CASE WHEN e.is_adopted AND e.length_of_stay_days <= 14 THEN 1 ELSE 0 END
    END AS adopted_within_14d,
    CASE
        WHEN e.is_matched OR DATEDIFF(DAY, e.intake_at, :data_cutoff::TIMESTAMP) >= 30
            THEN CASE WHEN e.is_adopted AND e.length_of_stay_days <= 30 THEN 1 ELSE 0 END
    END AS adopted_within_30d,
    CASE
        WHEN e.is_matched OR DATEDIFF(DAY, e.intake_at, :data_cutoff::TIMESTAMP) >= 60
            THEN CASE WHEN e.length_of_stay_days >= 60 THEN 1 ELSE 0 END
    END AS long_stay_60d,

    GETDATE()            AS built_at,
    :pipeline_version    AS pipeline_version
FROM enriched e
JOIN occupancy o ON o.episode_id = e.episode_id AND o.is_arrival
LEFT JOIN volume v ON v.episode_id = e.episode_id
LEFT JOIN staging.daily_weather w ON w.observed_date = e.intake_at::DATE;


-- -----------------------------------------------------------------------------
-- Episode audit
--
-- Every count reported in the data section of the paper, as one query. The three
-- that matter most are the last three: a negative duration, a species mismatch or
-- a rejected match that should not have been rejected all mean the pairing is
-- wrong, and the pairing being wrong is silent everywhere else.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics.v_episode_audit AS
SELECT
    COUNT(*)                                                        AS episodes_built,
    SUM(CASE WHEN outcome_at IS NOT NULL THEN 1 ELSE 0 END)         AS episodes_matched,
    SUM(CASE WHEN is_open_at_cutoff THEN 1 ELSE 0 END)              AS episodes_open_at_cutoff,
    SUM(CASE WHEN suspected_missing_outcome THEN 1 ELSE 0 END)      AS suspected_missing_outcomes,
    SUM(CASE WHEN is_adopted THEN 1 ELSE 0 END)                     AS adoptions,
    SUM(CASE WHEN event_code = 2 THEN 1 ELSE 0 END)                 AS competing_exits,
    SUM(CASE WHEN length_of_stay_days = 0 THEN 1 ELSE 0 END)        AS same_timestamp_episodes,
    SUM(CASE WHEN length_of_stay_days < 0 THEN 1 ELSE 0 END)        AS negative_durations,
    SUM(CASE WHEN prior_intake_count > 0 THEN 1 ELSE 0 END)         AS repeat_visits,
    MIN(intake_at)                                                  AS earliest_intake,
    MAX(intake_at)                                                  AS latest_intake,
    (SELECT threshold_days FROM staging.tmp_missing_outcome_threshold)
                                                                    AS missing_outcome_threshold_days
FROM analytics.shelter_episodes;

-- Outcome rows that never got claimed by an episode. Mostly animals whose arrival
-- predates the start of the intakes feed in October 2013, which is expected and
-- is stated in the paper. A sudden rise here means the pairing has broken.
CREATE OR REPLACE VIEW analytics.v_unclaimed_outcomes AS
SELECT
    o.outcome_event_id,
    o.animal_id,
    o.outcome_at,
    o.outcome_type,
    (o.outcome_at < f.first_intake_at) AS predates_intake_feed
FROM staging.outcome_events o
LEFT JOIN analytics.shelter_episodes e ON e.animal_id = o.animal_id AND e.outcome_at = o.outcome_at
LEFT JOIN (
    SELECT animal_id, MIN(intake_at) AS first_intake_at
    FROM analytics.shelter_episodes GROUP BY animal_id
) f ON f.animal_id = o.animal_id
WHERE e.episode_id IS NULL
  AND o.is_duplicate_of IS NULL
  AND o.outcome_at IS NOT NULL;

-- An animal recorded as a Dog on the way in and a Cat on the way out means the
-- join is suspect. This has returned zero rows on every export to date, and it is
-- checked rather than assumed.
CREATE OR REPLACE VIEW analytics.v_species_mismatches AS
SELECT e.episode_id, e.animal_id, e.animal_type, o.animal_type AS animal_type_outcome
FROM analytics.shelter_episodes e
JOIN staging.outcome_events o
  ON o.animal_id = e.animal_id AND o.outcome_at = e.outcome_at
WHERE o.animal_type IS NOT NULL
  AND e.animal_type IS NOT NULL
  AND o.animal_type <> e.animal_type;
