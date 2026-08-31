-- =============================================================================
-- SecondChance warehouse schema (Amazon Redshift Serverless)
--
-- Three layers, in the order data moves through them:
--
--   raw_*        an exact copy of what the API returned, plus provenance columns.
--                Never edited, never deduplicated. If a downstream number is ever
--                questioned, this is where the answer lives.
--   staging_*    typed, parsed and lightly cleaned. One row per source event.
--   analytics_*  the episode grain the models actually consume, plus the
--                aggregates the website reads.
--
-- Distribution and sort keys are chosen for the two access patterns that matter:
-- joining intakes to outcomes on animal_id, and scanning a date range. Getting
-- these wrong on Redshift is the difference between a 200 millisecond query and
-- a 40 second one, so they are set deliberately rather than left to AUTO.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS analytics;

-- -----------------------------------------------------------------------------
-- RAW LAYER
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS raw.austin_intakes CASCADE;
CREATE TABLE raw.austin_intakes (
    -- Source columns, all VARCHAR because the raw layer does not get to have
    -- opinions about types. A malformed date should land here and fail loudly in
    -- staging, not silently become NULL during the COPY.
    animal_id            VARCHAR(32),
    name                 VARCHAR(256),
    datetime_text        VARCHAR(64),
    monthyear_text       VARCHAR(64),
    found_location       VARCHAR(512),
    intake_type          VARCHAR(64),
    intake_condition     VARCHAR(64),
    animal_type          VARCHAR(32),
    sex_upon_intake      VARCHAR(32),
    age_upon_intake      VARCHAR(64),
    breed                VARCHAR(256),
    color                VARCHAR(256),

    -- Provenance. Every row can name the object it came from and the moment we
    -- fetched it, which is what makes "traceable to source" a fact rather than a
    -- claim in a report.
    source_system        VARCHAR(64)   NOT NULL DEFAULT 'austin_socrata_wter-evkm',
    source_s3_key        VARCHAR(1024) NOT NULL,
    retrieved_at         TIMESTAMP     NOT NULL,
    ingest_batch_id      VARCHAR(64)   NOT NULL,
    record_hash          VARCHAR(64)   NOT NULL   -- SHA-256 of the source row
)
DISTSTYLE KEY
DISTKEY (animal_id)
SORTKEY (retrieved_at);

DROP TABLE IF EXISTS raw.austin_outcomes CASCADE;
CREATE TABLE raw.austin_outcomes (
    animal_id            VARCHAR(32),
    name                 VARCHAR(256),
    datetime_text        VARCHAR(64),
    monthyear_text       VARCHAR(64),
    date_of_birth_text   VARCHAR(64),
    outcome_type         VARCHAR(64),
    outcome_subtype      VARCHAR(64),
    animal_type          VARCHAR(32),
    sex_upon_outcome     VARCHAR(32),
    age_upon_outcome     VARCHAR(64),
    breed                VARCHAR(256),
    color                VARCHAR(256),

    source_system        VARCHAR(64)   NOT NULL DEFAULT 'austin_socrata_9t4d-g238',
    source_s3_key        VARCHAR(1024) NOT NULL,
    retrieved_at         TIMESTAMP     NOT NULL,
    ingest_batch_id      VARCHAR(64)   NOT NULL,
    record_hash          VARCHAR(64)   NOT NULL
)
DISTSTYLE KEY
DISTKEY (animal_id)          -- co-located with intakes so the episode join is local
SORTKEY (retrieved_at);

DROP TABLE IF EXISTS raw.weather_observations CASCADE;
CREATE TABLE raw.weather_observations (
    station_id           VARCHAR(32),
    observed_date_text   VARCHAR(32),
    temperature_max_f    VARCHAR(32),
    temperature_min_f    VARCHAR(32),
    precipitation_in     VARCHAR(32),
    raw_payload          VARCHAR(65535),   -- the untouched JSON, for later reprocessing

    source_system        VARCHAR(64)   NOT NULL DEFAULT 'nws_api',
    source_s3_key        VARCHAR(1024) NOT NULL,
    retrieved_at         TIMESTAMP     NOT NULL,
    ingest_batch_id      VARCHAR(64)   NOT NULL
)
DISTSTYLE ALL                -- tiny table, broadcast it so date joins never shuffle
SORTKEY (observed_date_text);

DROP TABLE IF EXISTS raw.rescuegroups_listings CASCADE;
CREATE TABLE raw.rescuegroups_listings (
    listing_id           VARCHAR(64),
    organization_id      VARCHAR(64),
    organization_name    VARCHAR(256),
    species              VARCHAR(64),
    breed_primary        VARCHAR(256),
    breed_secondary      VARCHAR(256),
    age_group            VARCHAR(64),
    sex                  VARCHAR(32),
    size_group           VARCHAR(64),
    city                 VARCHAR(128),
    state                VARCHAR(8),
    postal_code          VARCHAR(16),
    listed_at_text       VARCHAR(64),
    raw_payload          VARCHAR(65535),

    source_system        VARCHAR(64)   NOT NULL DEFAULT 'rescuegroups_v5',
    source_s3_key        VARCHAR(1024) NOT NULL,
    retrieved_at         TIMESTAMP     NOT NULL,
    ingest_batch_id      VARCHAR(64)   NOT NULL
)
DISTSTYLE EVEN
SORTKEY (retrieved_at);

-- Structured breed attributes produced by the language model labeling step.
-- Versioned by prompt hash so that a change to the prompt cannot silently change
-- historical features without leaving a trace.
DROP TABLE IF EXISTS raw.breed_attributes CASCADE;
CREATE TABLE raw.breed_attributes (
    breed_token          VARCHAR(128) NOT NULL,
    akc_group            VARCHAR(64),
    size_class           VARCHAR(16),
    typical_weight_lb    SMALLINT,
    coat_length          VARCHAR(16),
    grooming_need        VARCHAR(16),
    energy_level         VARCHAR(16),
    is_bully_type        BOOLEAN,
    is_brachycephalic    BOOLEAN,
    is_guardian_breed    BOOLEAN,
    has_bsl_risk         BOOLEAN,
    is_recognized_breed  BOOLEAN,

    model_id             VARCHAR(128) NOT NULL,
    prompt_version_hash  VARCHAR(64)  NOT NULL,
    labeled_at           TIMESTAMP    NOT NULL,
    human_reviewed       BOOLEAN      NOT NULL DEFAULT FALSE,
    human_reviewer       VARCHAR(128),
    human_review_note    VARCHAR(1024)
)
DISTSTYLE ALL
SORTKEY (breed_token);

-- -----------------------------------------------------------------------------
-- STAGING LAYER
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS staging.intake_events CASCADE;
CREATE TABLE staging.intake_events (
    intake_event_id      VARCHAR(64)  NOT NULL,
    animal_id            VARCHAR(32)  NOT NULL,
    intake_at            TIMESTAMP    NOT NULL,
    animal_name          VARCHAR(256),
    name_is_shelter_assigned BOOLEAN,
    found_location       VARCHAR(512),
    intake_type          VARCHAR(64),
    intake_condition     VARCHAR(64),
    animal_type          VARCHAR(32),
    sex_upon_intake      VARCHAR(32),
    age_upon_intake_days DECIMAL(10, 2),
    breed_raw            VARCHAR(256),
    color_raw            VARCHAR(256),
    is_duplicate_of      VARCHAR(64),
    quality_flags        VARCHAR(512),   -- comma separated, empty when clean
    loaded_at            TIMESTAMP    NOT NULL
)
DISTSTYLE KEY
DISTKEY (animal_id)
SORTKEY (intake_at);

DROP TABLE IF EXISTS staging.outcome_events CASCADE;
CREATE TABLE staging.outcome_events (
    outcome_event_id     VARCHAR(64)  NOT NULL,
    animal_id            VARCHAR(32)  NOT NULL,
    outcome_at           TIMESTAMP    NOT NULL,
    outcome_type         VARCHAR(64),
    outcome_subtype      VARCHAR(64),
    animal_type          VARCHAR(32),
    sex_upon_outcome     VARCHAR(32),
    age_upon_outcome_days DECIMAL(10, 2),
    date_of_birth        DATE,
    is_duplicate_of      VARCHAR(64),
    quality_flags        VARCHAR(512),
    loaded_at            TIMESTAMP    NOT NULL
)
DISTSTYLE KEY
DISTKEY (animal_id)
SORTKEY (outcome_at);

DROP TABLE IF EXISTS staging.daily_weather CASCADE;
CREATE TABLE staging.daily_weather (
    observed_date        DATE         NOT NULL,
    station_id           VARCHAR(32)  NOT NULL,
    temperature_max_f    DECIMAL(6, 2),
    temperature_min_f    DECIMAL(6, 2),
    precipitation_in     DECIMAL(6, 3),
    temperature_max_7d_mean DECIMAL(6, 2),
    precipitation_7d_total  DECIMAL(6, 3),
    is_imputed           BOOLEAN NOT NULL DEFAULT FALSE,
    loaded_at            TIMESTAMP    NOT NULL
)
DISTSTYLE ALL
SORTKEY (observed_date);

-- -----------------------------------------------------------------------------
-- ANALYTICS LAYER
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS analytics.shelter_episodes CASCADE;
CREATE TABLE analytics.shelter_episodes (
    episode_id                   VARCHAR(64)  NOT NULL,
    animal_id                    VARCHAR(32)  NOT NULL,
    episode_number               SMALLINT     NOT NULL,
    intake_at                    TIMESTAMP    NOT NULL,
    outcome_at                   TIMESTAMP,
    effective_exit_at            TIMESTAMP,
    length_of_stay_days          DECIMAL(10, 4),

    -- Event coding for survival analysis. 0 censored, 1 adopted, 2 exited by any
    -- other route. Keeping the three states apart is the whole reason the
    -- competing risk estimates in the paper are defensible.
    event_code                   SMALLINT     NOT NULL,
    is_adopted                   BOOLEAN      NOT NULL,
    is_open_at_cutoff            BOOLEAN      NOT NULL,
    suspected_missing_outcome    BOOLEAN      NOT NULL DEFAULT FALSE,

    outcome_type                 VARCHAR(64),
    outcome_subtype              VARCHAR(64),

    animal_type                  VARCHAR(32),
    breed_raw                    VARCHAR(256),
    breed_primary_token          VARCHAR(128),
    breed_primary_group          VARCHAR(64),
    breed_size_ordinal           SMALLINT,
    breed_weight_lb              SMALLINT,
    breed_coat_ordinal           SMALLINT,
    breed_is_mix                 BOOLEAN,
    breed_is_bully_type          BOOLEAN,
    breed_has_bsl_risk           BOOLEAN,
    color_raw                    VARCHAR(256),
    color_has_black              BOOLEAN,
    sex_upon_intake              VARCHAR(32),
    is_sterilized_at_intake      BOOLEAN,
    age_at_intake_days           DECIMAL(10, 2),
    age_band                     VARCHAR(32),
    has_name                     BOOLEAN,
    name_is_shelter_assigned     BOOLEAN,

    intake_type                  VARCHAR(64),
    intake_condition             VARCHAR(64),
    prior_intake_count           SMALLINT,
    shelter_census_at_intake     INTEGER,
    species_census_at_intake     INTEGER,
    intakes_prior_7d             INTEGER,
    intakes_prior_30d            INTEGER,
    adoptions_prior_30d          INTEGER,

    weather_tmax_f               DECIMAL(6, 2),
    weather_tmin_f               DECIMAL(6, 2),
    weather_prcp_in              DECIMAL(6, 3),

    adopted_within_7d            SMALLINT,   -- NULL means the label is not observable
    adopted_within_14d           SMALLINT,
    adopted_within_30d           SMALLINT,
    long_stay_60d                SMALLINT,

    built_at                     TIMESTAMP    NOT NULL,
    pipeline_version             VARCHAR(32)  NOT NULL
)
DISTSTYLE KEY
DISTKEY (animal_id)
SORTKEY (intake_at);

DROP TABLE IF EXISTS analytics.predictions CASCADE;
CREATE TABLE analytics.predictions (
    prediction_id                VARCHAR(64)  NOT NULL,
    episode_id                   VARCHAR(64)  NOT NULL,
    animal_id                    VARCHAR(32)  NOT NULL,
    scored_at                    TIMESTAMP    NOT NULL,
    model_version                VARCHAR(64)  NOT NULL,
    feature_snapshot_hash        VARCHAR(64)  NOT NULL,

    p_adopt_7d                   DECIMAL(6, 5),
    p_adopt_14d                  DECIMAL(6, 5),
    p_adopt_30d                  DECIMAL(6, 5),
    p_long_stay_60d              DECIMAL(6, 5),
    expected_days_in_shelter     DECIMAL(8, 2),

    -- The top three SHAP drivers, stored as text so the queue card can render an
    -- explanation without recomputing anything at request time.
    explanation_top_drivers      VARCHAR(1024),

    -- Populated later by the label backfill job. Keeping the realised outcome next
    -- to the prediction is what makes retrospective monitoring a single query.
    realised_adopted_within_30d  SMALLINT,
    realised_long_stay_60d       SMALLINT,
    label_resolved_at            TIMESTAMP
)
DISTSTYLE KEY
DISTKEY (animal_id)
SORTKEY (scored_at);

DROP TABLE IF EXISTS analytics.model_registry CASCADE;
CREATE TABLE analytics.model_registry (
    model_version          VARCHAR(64)  NOT NULL,
    trained_at             TIMESTAMP    NOT NULL,
    training_data_cutoff   DATE         NOT NULL,
    n_training_episodes    INTEGER      NOT NULL,
    algorithm              VARCHAR(64)  NOT NULL,
    hyperparameters_json   VARCHAR(4096),
    feature_list_hash      VARCHAR(64)  NOT NULL,

    validation_roc_auc     DECIMAL(6, 5),
    validation_pr_auc      DECIMAL(6, 5),
    validation_brier       DECIMAL(6, 5),
    validation_ece         DECIMAL(6, 5),

    approved_by            VARCHAR(128),
    approved_at            TIMESTAMP,
    deployed_at            TIMESTAMP,
    retired_at             TIMESTAMP,
    model_card_uri         VARCHAR(512)
)
DISTSTYLE ALL
SORTKEY (trained_at);

DROP TABLE IF EXISTS analytics.monitoring_runs CASCADE;
CREATE TABLE analytics.monitoring_runs (
    run_id                 VARCHAR(64)  NOT NULL,
    ran_at                 TIMESTAMP    NOT NULL,
    model_version          VARCHAR(64)  NOT NULL,
    window_start           DATE         NOT NULL,
    window_end             DATE         NOT NULL,
    n_scored               INTEGER,
    n_labelled             INTEGER,

    max_feature_psi        DECIMAL(8, 5),
    mean_feature_psi       DECIMAL(8, 5),
    n_features_critical    SMALLINT,
    worst_drifting_feature VARCHAR(128),

    rolling_roc_auc        DECIMAL(6, 5),
    rolling_brier          DECIMAL(6, 5),
    calibration_gap        DECIMAL(7, 5),
    auc_relative_drop      DECIMAL(7, 5),

    overall_status         VARCHAR(24)  NOT NULL,   -- OK, WARNING, CRITICAL
    llm_review_verdict     VARCHAR(24),             -- the automated second opinion
    llm_review_summary     VARCHAR(4096),
    human_reviewed_by      VARCHAR(128),
    human_review_at        TIMESTAMP,
    action_taken           VARCHAR(256)
)
DISTSTYLE ALL
SORTKEY (ran_at);

-- Documented audit of the labeling step. Required by the governance section: any
-- automated label that feeds a decision has to be sampled and checked by a human.
DROP TABLE IF EXISTS analytics.labeling_audit CASCADE;
CREATE TABLE analytics.labeling_audit (
    audit_id               VARCHAR(64)  NOT NULL,
    audited_at             TIMESTAMP    NOT NULL,
    breed_token            VARCHAR(128) NOT NULL,
    field_name             VARCHAR(64)  NOT NULL,
    model_value            VARCHAR(128),
    reference_value        VARCHAR(128),
    reference_source       VARCHAR(256),
    agrees                 BOOLEAN      NOT NULL,
    reviewer               VARCHAR(128) NOT NULL
)
DISTSTYLE ALL
SORTKEY (audited_at);
