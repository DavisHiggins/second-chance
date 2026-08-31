-- =============================================================================
-- SecondChance analytics layer
--
-- Everything the website reads and everything the monitoring job compares
-- against. Nothing here recomputes a model output: the predictions arrive from
-- the endpoint and land in analytics.predictions, and this file only aggregates
-- and joins.
--
-- Two things are worth reading before the SQL.
--
-- First, the label backfill. The 30 day label does not exist for 30 days and the
-- 60 day label does not exist for 60. Outcome monitoring is therefore structurally
-- six weeks behind its own cause, which is the single most important operational
-- fact in this project and the reason input drift is monitored at all. The
-- backfill below is what closes that loop, and the view that reports it is
-- explicit about how much of the recent window is still unlabelled.
--
-- Second, the ranking. The needs-attention queue is ordered by predicted long-stay
-- risk, descending, and it exists to route help toward the animals at the top. It
-- must never be read the other way round. There is no view in this file that
-- ranks animals by how little they are worth spending time on, and adding one
-- would contradict the use policy the API serves on every response.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Label backfill
--
-- Join each stored prediction to the outcome that eventually happened. Only fills
-- a label once the horizon has actually elapsed, so a row scored eight days ago
-- gets its 7 day answer and nothing else.
-- -----------------------------------------------------------------------------
UPDATE analytics.predictions p
SET realised_adopted_within_30d = e.adopted_within_30d,
    realised_long_stay_60d      = e.long_stay_60d,
    label_resolved_at           = GETDATE()
FROM analytics.shelter_episodes e
WHERE e.episode_id = p.episode_id
  AND p.label_resolved_at IS NULL
  AND e.adopted_within_30d IS NOT NULL
  AND DATEDIFF(DAY, p.scored_at, GETDATE()) >= 30;


-- -----------------------------------------------------------------------------
-- analytics.v_current_population
--
-- Who is in the building right now, with their most recent score. This is the
-- table the operations dashboard counts from.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics.v_current_population AS
WITH latest_score AS (
    SELECT
        episode_id,
        p_adopt_7d, p_adopt_30d, p_long_stay_60d, expected_days_in_shelter,
        explanation_top_drivers, model_version, scored_at,
        ROW_NUMBER() OVER (PARTITION BY episode_id ORDER BY scored_at DESC) AS recency_rank
    FROM analytics.predictions
)
SELECT
    e.episode_id,
    e.animal_id,
    e.animal_type,
    e.breed_raw,
    e.breed_primary_token,
    e.age_band,
    e.age_at_intake_days,
    e.intake_at,
    e.intake_type,
    e.intake_condition,
    e.name_is_shelter_assigned,
    e.has_name,
    DATEDIFF(DAY, e.intake_at, GETDATE())      AS days_in_shelter,
    s.p_adopt_7d,
    s.p_adopt_30d,
    s.p_long_stay_60d,
    s.expected_days_in_shelter,
    s.explanation_top_drivers,
    s.model_version,
    s.scored_at
FROM analytics.shelter_episodes e
LEFT JOIN latest_score s ON s.episode_id = e.episode_id AND s.recency_rank = 1
WHERE e.is_open_at_cutoff
  AND NOT e.suspected_missing_outcome;


-- -----------------------------------------------------------------------------
-- analytics.v_needs_attention_queue
--
-- The product. Ranked by predicted long-stay risk, with the band cut at multiples
-- of the base rate rather than at fixed probabilities.
--
-- The reason for that choice: isotonic calibration on a target with an 11.6
-- percent positive rate compresses almost every score into a narrow band, so a
-- fixed 0.7 cutoff would select nobody and a fixed 0.2 cutoff would select half
-- the shelter. Multiples of the base rate keep the bands meaningful when the base
-- rate itself moves, which it did, sharply, in 2020.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics.v_needs_attention_queue AS
WITH base_rate AS (
    SELECT AVG(long_stay_60d::DECIMAL(6, 5)) AS rate
    FROM analytics.shelter_episodes
    WHERE long_stay_60d IS NOT NULL
      AND intake_at >= DATEADD(YEAR, -1, GETDATE())
)
SELECT
    c.*,
    b.rate AS long_stay_base_rate,
    CASE
        WHEN c.p_long_stay_60d IS NULL      THEN 'not_scored'
        WHEN c.p_long_stay_60d >= b.rate * 4 THEN 'critical'
        WHEN c.p_long_stay_60d >= b.rate * 3 THEN 'serious'
        WHEN c.p_long_stay_60d >= b.rate * 2 THEN 'warning'
        ELSE 'steady'
    END AS risk_band,
    -- What the shelter should actually do, which is the only reason the score is
    -- on a screen. Every branch adds something the animal receives.
    CASE
        WHEN c.intake_condition IN ('Injured', 'Sick', 'Nursing')
            THEN 'medical and behaviour support'
        WHEN c.age_at_intake_days > 2922 THEN 'senior adoption event'
        WHEN c.age_at_intake_days < 60   THEN 'foster placement'
        WHEN c.animal_type = 'Dog' AND c.breed_primary_token IS NOT NULL
            THEN 'breed-specific rescue outreach'
        ELSE 'photography'
    END AS suggested_intervention,
    ROW_NUMBER() OVER (ORDER BY c.p_long_stay_60d DESC NULLS LAST) AS queue_position
FROM analytics.v_current_population c
CROSS JOIN base_rate b;


-- -----------------------------------------------------------------------------
-- analytics.v_monthly_trends
--
-- The dashboard's time series. Trimmed at the point where the 60 day label stops
-- being observable, because the long-stay rate for the last two months is zero by
-- construction and plotting it would draw a collapse that did not happen.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics.v_monthly_trends AS
SELECT
    DATE_TRUNC('month', intake_at)::DATE                 AS month,
    COUNT(*)                                             AS intakes,
    SUM(CASE WHEN is_adopted THEN 1 ELSE 0 END)          AS adoptions,
    AVG(CASE WHEN is_adopted THEN length_of_stay_days END) AS mean_days_to_adoption,
    PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY CASE WHEN is_adopted THEN length_of_stay_days END
    )                                                    AS median_days_to_adoption,
    AVG(adopted_within_30d::DECIMAL(6, 5))               AS adopted_within_30d_rate,
    AVG(long_stay_60d::DECIMAL(6, 5))                    AS long_stay_60d_rate,
    AVG(shelter_census_at_intake::DECIMAL(10, 2))        AS mean_census_at_intake
FROM analytics.shelter_episodes
WHERE intake_at < DATEADD(DAY, -60, (SELECT MAX(intake_at) FROM analytics.shelter_episodes))
GROUP BY 1;


-- -----------------------------------------------------------------------------
-- analytics.v_outcome_mix
--
-- The number the headline finding rests on. If competing exits ever stop being
-- roughly half of all departures, the size of the estimator error changes and the
-- paper's central claim needs restating rather than repeating.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics.v_outcome_mix AS
SELECT
    DATE_TRUNC('year', intake_at)::DATE AS year,
    animal_type,
    COUNT(*)                                                       AS closed_episodes,
    AVG(CASE WHEN is_adopted THEN 1.0 ELSE 0.0 END)                AS adoption_share,
    AVG(CASE WHEN event_code = 2 THEN 1.0 ELSE 0.0 END)            AS competing_exit_share,
    AVG(CASE WHEN outcome_type = 'Transfer' THEN 1.0 ELSE 0.0 END) AS transfer_share,
    AVG(CASE WHEN outcome_type = 'Return to Owner' THEN 1.0 ELSE 0.0 END) AS rto_share
FROM analytics.shelter_episodes
WHERE NOT is_open_at_cutoff
GROUP BY 1, 2;


-- -----------------------------------------------------------------------------
-- analytics.v_subgroup_performance
--
-- The fairness table, recomputed from live predictions rather than copied from
-- the paper. A subgroup with fewer than 200 labelled rows reports its size and
-- nothing else: an AUC on forty animals is noise dressed up as a finding.
--
-- The measured gap this exists to keep watching: dogs carrying a bully-type breed
-- label are ranked less accurately than other dogs and the model is under-confident
-- about them. Because the queue routes help toward low adoption scores, that error
-- pushes them higher in the queue, which is the safer direction. It is still an
-- error, it is in the model card, and it is monitored here.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics.v_subgroup_performance AS
WITH labelled AS (
    SELECT
        e.animal_type,
        e.age_band,
        e.breed_is_bully_type,
        e.breed_has_bsl_risk,
        e.color_has_black,
        e.intake_type,
        p.p_adopt_30d,
        p.realised_adopted_within_30d AS y
    FROM analytics.predictions p
    JOIN analytics.shelter_episodes e ON e.episode_id = p.episode_id
    WHERE p.realised_adopted_within_30d IS NOT NULL
)
SELECT 'animal_type' AS attribute, animal_type::VARCHAR AS level,
       COUNT(*) AS n, AVG(y::DECIMAL(6, 5)) AS observed_rate,
       AVG(p_adopt_30d) AS mean_predicted,
       AVG(p_adopt_30d) - AVG(y::DECIMAL(6, 5)) AS calibration_gap
FROM labelled GROUP BY animal_type
UNION ALL
SELECT 'age_band', age_band::VARCHAR, COUNT(*), AVG(y::DECIMAL(6, 5)),
       AVG(p_adopt_30d), AVG(p_adopt_30d) - AVG(y::DECIMAL(6, 5))
FROM labelled GROUP BY age_band
UNION ALL
SELECT 'breed_is_bully_type', breed_is_bully_type::VARCHAR, COUNT(*), AVG(y::DECIMAL(6, 5)),
       AVG(p_adopt_30d), AVG(p_adopt_30d) - AVG(y::DECIMAL(6, 5))
FROM labelled GROUP BY breed_is_bully_type
UNION ALL
SELECT 'breed_has_bsl_risk', breed_has_bsl_risk::VARCHAR, COUNT(*), AVG(y::DECIMAL(6, 5)),
       AVG(p_adopt_30d), AVG(p_adopt_30d) - AVG(y::DECIMAL(6, 5))
FROM labelled GROUP BY breed_has_bsl_risk
UNION ALL
SELECT 'color_has_black', color_has_black::VARCHAR, COUNT(*), AVG(y::DECIMAL(6, 5)),
       AVG(p_adopt_30d), AVG(p_adopt_30d) - AVG(y::DECIMAL(6, 5))
FROM labelled GROUP BY color_has_black
UNION ALL
SELECT 'intake_type', intake_type::VARCHAR, COUNT(*), AVG(y::DECIMAL(6, 5)),
       AVG(p_adopt_30d), AVG(p_adopt_30d) - AVG(y::DECIMAL(6, 5))
FROM labelled GROUP BY intake_type;


-- -----------------------------------------------------------------------------
-- analytics.v_monitoring_input
--
-- What the weekly monitoring Lambda reads. One row per scored episode with its
-- feature values and its label, if the label exists yet.
--
-- label_status is the column that keeps the monitoring job honest. A period where
-- most rows are still 'pending' cannot be evaluated on outcomes at all, and the
-- job has to fall back to input drift rather than quietly averaging whatever
-- labels happen to have arrived, which would be a biased sample of the fast ones.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics.v_monitoring_input AS
SELECT
    p.prediction_id,
    p.episode_id,
    p.scored_at,
    DATE_TRUNC('week', p.scored_at)::DATE AS score_week,
    p.model_version,
    p.p_adopt_30d,
    p.p_long_stay_60d,
    p.realised_adopted_within_30d,
    p.realised_long_stay_60d,
    CASE
        WHEN p.realised_adopted_within_30d IS NOT NULL         THEN 'labelled'
        WHEN DATEDIFF(DAY, p.scored_at, GETDATE()) < 30        THEN 'pending'
        ELSE 'unresolved'
    END AS label_status,
    e.animal_type,
    e.age_at_intake_days,
    e.age_band,
    e.intake_type,
    e.intake_condition,
    e.breed_size_ordinal,
    e.breed_weight_lb,
    e.breed_is_bully_type,
    e.shelter_census_at_intake,
    e.species_census_at_intake,
    e.intakes_prior_7d,
    e.intakes_prior_30d,
    e.adoptions_prior_30d,
    e.prior_intake_count,
    e.is_sterilized_at_intake,
    e.name_is_shelter_assigned
FROM analytics.predictions p
JOIN analytics.shelter_episodes e ON e.episode_id = p.episode_id;


-- -----------------------------------------------------------------------------
-- analytics.v_label_lag
--
-- How far behind outcome monitoring currently is. Read this before believing any
-- performance number computed on a recent window.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics.v_label_lag AS
SELECT
    score_week,
    COUNT(*)                                                          AS scored,
    SUM(CASE WHEN label_status = 'labelled' THEN 1 ELSE 0 END)        AS labelled,
    SUM(CASE WHEN label_status = 'pending' THEN 1 ELSE 0 END)         AS still_pending,
    SUM(CASE WHEN label_status = 'unresolved' THEN 1 ELSE 0 END)      AS unresolved,
    AVG(CASE WHEN label_status = 'labelled' THEN 1.0 ELSE 0.0 END)    AS labelled_share
FROM analytics.v_monitoring_input
GROUP BY score_week;


-- -----------------------------------------------------------------------------
-- analytics.v_model_health
--
-- The last twelve monitoring runs, in the order a person would want to read them.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics.v_model_health AS
SELECT
    ran_at,
    model_version,
    window_start,
    window_end,
    n_scored,
    n_labelled,
    rolling_roc_auc,
    calibration_gap,
    auc_relative_drop,
    max_feature_psi,
    worst_drifting_feature,
    n_features_critical,
    overall_status,
    llm_review_verdict,
    human_reviewed_by,
    action_taken,
    -- Discrimination and calibration fail separately. In this project calibration
    -- failed first and harder: mean monthly AUC barely moved across the 2020 shift
    -- while the predicted 30 day adoption rate ran 7.6 points above the observed
    -- one. A dashboard that shows only AUC shows a healthy model for months.
    CASE
        WHEN ABS(calibration_gap) >= 0.10 AND auc_relative_drop < 0.03
            THEN 'calibration_only'
        WHEN ABS(calibration_gap) < 0.05 AND auc_relative_drop >= 0.07
            THEN 'discrimination_only'
        WHEN ABS(calibration_gap) >= 0.05 AND auc_relative_drop >= 0.03
            THEN 'both'
        ELSE 'neither'
    END AS failure_mode
FROM analytics.monitoring_runs
ORDER BY ran_at DESC;


-- -----------------------------------------------------------------------------
-- analytics.v_labeling_audit_summary
--
-- Agreement between the language model's breed attributes and the human reviewer's.
-- Required by the governance section: any automated label that feeds a decision has
-- to be sampled and checked, and the check has to be reportable.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics.v_labeling_audit_summary AS
SELECT
    field_name,
    COUNT(*)                                            AS audited,
    SUM(CASE WHEN agrees THEN 1 ELSE 0 END)             AS agreed,
    AVG(CASE WHEN agrees THEN 1.0 ELSE 0.0 END)         AS agreement_rate,
    MAX(audited_at)                                     AS last_audited_at
FROM analytics.labeling_audit
GROUP BY field_name;


-- -----------------------------------------------------------------------------
-- Reconciliation against the research pipeline
--
-- The Python build in analysis/ and the warehouse build in 03_episodes.sql are two
-- implementations of the same rule. This view is the check that they agree, and it
-- is the reason having both is defensible rather than just duplicated work.
--
-- Load the Python episode audit into analytics.reference_counts before running it.
-- A non-empty result means one of the two is wrong and neither should be trusted
-- until it is known which.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics.reference_counts (
    metric_name  VARCHAR(64) NOT NULL,
    metric_value DECIMAL(18, 4) NOT NULL,
    source       VARCHAR(64) NOT NULL,
    recorded_at  TIMESTAMP   NOT NULL
)
DISTSTYLE ALL
SORTKEY (recorded_at);

CREATE OR REPLACE VIEW analytics.v_pipeline_reconciliation AS
WITH warehouse AS (
    SELECT 'episodes_built'      AS metric_name, episodes_built::DECIMAL(18, 4)      AS metric_value FROM analytics.v_episode_audit
    UNION ALL SELECT 'episodes_matched',         episodes_matched::DECIMAL(18, 4)          FROM analytics.v_episode_audit
    UNION ALL SELECT 'episodes_open_at_cutoff',  episodes_open_at_cutoff::DECIMAL(18, 4)   FROM analytics.v_episode_audit
    UNION ALL SELECT 'adoptions',                adoptions::DECIMAL(18, 4)                 FROM analytics.v_episode_audit
    UNION ALL SELECT 'competing_exits',          competing_exits::DECIMAL(18, 4)           FROM analytics.v_episode_audit
),
reference AS (
    SELECT metric_name, metric_value
    FROM analytics.reference_counts
    WHERE source = 'python_pipeline'
      AND recorded_at = (SELECT MAX(recorded_at) FROM analytics.reference_counts WHERE source = 'python_pipeline')
)
SELECT
    w.metric_name,
    w.metric_value AS warehouse_value,
    r.metric_value AS python_value,
    w.metric_value - r.metric_value AS difference
FROM warehouse w
JOIN reference r ON r.metric_name = w.metric_name
WHERE w.metric_value <> r.metric_value;
