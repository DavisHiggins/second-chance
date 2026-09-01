/**
 * Types generated from API_CONTRACT.md. The static fixtures in `src/data` have
 * exactly these shapes, so one set of types serves both modes.
 *
 * `null` always means "not measured". It never means zero, and the UI renders it
 * as "not measured".
 */

export type RiskBand = "critical" | "serious" | "warning" | "ok";
export type Direction = "raises" | "lowers";
export type Evidence = "measured" | "assumed";
export type Confidence = "high" | "moderate" | "low";
export type HealthStatus = "healthy" | "degraded";

export interface UsePolicy {
  intended_use: string;
  prohibited_use: string;
}

/** Every response carries these three. A response without them is an error. */
export interface Envelope {
  model_version: string;
  data_as_of: string;
  use_policy: UsePolicy;
  /** Set by the data source when a live call failed and a fixture was served. */
  using_fallback_data: boolean;
}

export interface Health extends Envelope {
  status: HealthStatus;
  checked_at: string;
}

export interface Driver {
  feature: string;
  label: string;
  contribution: number;
  direction: Direction;
}

export interface SurvivalPoint {
  day: number;
  still_in_shelter: number | null;
  adopted_by?: number | null;
}

export interface QueueAnimal {
  animal_id: string;
  episode_id: string;
  name: string | null;
  name_is_shelter_assigned: boolean;
  animal_type: string;
  breed: string;
  breed_primary_group: string;
  color: string;
  age_band: string;
  age_at_intake_days: number;
  sex_upon_intake: string;
  intake_type: string;
  intake_condition: string;
  intake_datetime: string;
  days_in_care: number;
  photo_url: string | null;
  p_adopt_7d: number | null;
  p_adopt_14d: number | null;
  p_adopt_30d: number | null;
  p_long_stay_60d: number | null;
  expected_days_in_shelter: number | null;
  risk_band: RiskBand;
  drivers: Driver[];
  survival_curve: SurvivalPoint[];
  suggested_channel: string;
  confidence?: Confidence;
  interval?: {
    p_adopt_30d?: [number, number];
    expected_days_in_shelter?: [number, number];
  };
}

export interface QueueResponse extends Envelope {
  animals: QueueAnimal[];
  total_available: number;
  generated_at: string;
}

export interface TimelineEvent {
  event: string;
  at: string;
  detail: string;
}

export interface SimilarAnimal {
  animal_id: string;
  name: string | null;
  breed: string;
  days_to_outcome: number;
  outcome: string;
  similarity: number;
}

/** Present in the demo fixture only, so a reviewer can check the prediction. */
export interface ActualOutcome {
  note: string;
  outcome_type: string;
  days_to_outcome: number;
}

export interface AnimalDetail extends QueueAnimal {
  timeline: TimelineEvent[];
  similar_animals: SimilarAnimal[];
  actual_outcome?: ActualOutcome;
}

export interface AnimalResponse extends Envelope {
  animal: AnimalDetail;
}

export interface InterventionChannel {
  channel: string;
  label: string;
  rationale: string;
  evidence: Evidence;
  evidence_detail: string;
  staff_minutes: number;
}

export interface InterventionsResponse extends Envelope {
  channels: InterventionChannel[];
  driver_to_channel?: Record<string, string>;
}

export interface TrendMonth {
  month: string;
  census: number;
  intakes: number;
  adoptions: number;
  adoption_rate: number;
  adopted_within_30d_rate: number;
  long_stay_60d_rate: number;
  median_days_to_adoption: number;
}

export interface ForecastPoint {
  date: string;
  central: number;
  low: number;
  high: number;
}

export interface ForecastHistoryPoint {
  month: string;
  census: number;
}

export interface Forecast {
  method: string;
  method_note: string;
  history: ForecastHistoryPoint[];
  forecast: ForecastPoint[];
  capacity_reference: number;
  data_as_of: string;
}

export interface Segment {
  dimension: string;
  level: string;
  n: number;
  median_expected_days: number;
  median_p_adopt_30: number;
}

export interface Metadata {
  model_version: string;
  data_as_of: string;
  model_trained_at: string;
  current_census: number;
  queue_size: number;
  recent_window_size: number;
  recent_window_start: string;
  needs_attention: number;
  needs_attention_critical: number;
  median_days_to_adoption: number;
  adoption_rate_30d: number;
  capacity_reference: number;
  long_stay_base_rate: number;
  risk_band_cuts: Record<string, number>;
  risk_band_note: string;
  champion_auc_30d: number;
  champion_ece_30d: number;
  worst_drift_psi: number;
  worst_drift_feature: string;
  worst_drift_status: string;
  using_sample_data: boolean;
}

export interface ModelHealthRow {
  id: string;
  label: string;
  value: number | string | null;
  display: string;
  status: "good" | "warning" | "serious" | "critical";
  href: string;
}

/* --------------------------------------------------------------------------
   Model summary. MEASURED_RESULTS.json verbatim. Everything on /model reads
   from here; nothing on that route computes.
   -------------------------------------------------------------------------- */

export interface ModelMetrics {
  n: number;
  positive_rate: number;
  roc_auc: number | null;
  pr_auc: number | null;
  brier: number | null;
  log_loss: number | null;
  ece: number | null;
  calibration_slope: number | null;
  calibration_intercept: number | null;
  precision_at_20: number | null;
  lift_at_20: number | null;
  precision_at_50: number | null;
  lift_at_50: number | null;
  precision_at_100: number | null;
  lift_at_100: number | null;
  roc_auc_ci?: [number, number];
  pr_auc_ci?: [number, number];
}

export interface TargetBlock {
  n_train: number;
  n_valid: number;
  n_test: number;
  train_positive_rate: number;
  valid_positive_rate: number;
  test_positive_rate: number;
  models: Record<string, { test_calibrated?: ModelMetrics; test_raw?: ModelMetrics }>;
}

export interface SubgroupRow {
  attribute: string;
  level: string;
  n: number;
  positive_rate: number;
  roc_auc: number | null;
  mean_predicted: number | null;
  ece: number | null;
  calibration_gap: number | null;
}

export interface MonthlyPerformanceRow {
  period: string;
  n: number;
  roc_auc: number | null;
  brier: number | null;
  observed_rate: number | null;
  mean_predicted: number | null;
  calibration_gap: number | null;
  auc_relative_drop: number | null;
  auc_status: string | null;
  calibration_status: string | null;
  status: string;
}

export interface ShapRow {
  feature: string;
  mean_abs_shap: number;
  direction: number;
}

export interface DriftFeature {
  feature: string;
  kind: string;
  psi: number;
  status: string;
  reference_mean: number | null;
  current_mean: number | null;
}

export interface CalibrationDecile {
  decile: number;
  n: number;
  mean_predicted_30d: number;
  observed_cif_30d: number;
  mean_predicted_rmst_days: number;
}

export interface ModelSummary extends Envelope {
  metadata: {
    generated_at: string;
    model_version: string;
    data_as_of: string;
    model_trained_at: string;
    data_sources: string[];
    study_period: [string, string];
    feature_count: number;
  };
  split: { train_end: string; valid_end: string; test_end: string };
  block_counts: { train: number; valid: number; test: number; excluded: number };
  block_date_ranges: Record<string, [string, string]>;
  cohort: Record<string, number>;
  targets: Record<string, TargetBlock>;
  subgroups: Record<string, SubgroupRow[]>;
  ablations: Record<string, unknown>;
  survival: {
    median_days_to_adoption_cause_specific: number;
    n_episodes: number;
    n_adoptions: number;
    estimator_comparison: Array<{
      day: number;
      kaplan_meier_cause_specific: number;
      aalen_johansen_cif: number;
      overstatement: number;
      relative_overstatement_pct: number;
    }>;
    survival_calibration_by_decile: CalibrationDecile[];
    cox?: Record<string, unknown>;
  };
  drift: {
    known_shift_date: string;
    thresholds: Record<string, number>;
    top_drifting_features_post_shift: DriftFeature[];
    [key: string]: unknown;
  };
  monthly_performance: MonthlyPerformanceRow[];
  interpretability: {
    adopt_30d: {
      top_10_shap: ShapRow[];
      top_10_permutation: Array<{ feature: string; auc_drop_mean: number; auc_drop_std: number }>;
      baseline_test_auc: number;
    };
    long_stay_60d: {
      top_10_shap: ShapRow[];
      top_10_permutation: Array<{ feature: string; auc_drop_mean: number; auc_drop_std: number }>;
      baseline_test_auc: number;
    };
  };
  headline: Record<string, number | number[]>;
}

export interface ApiError {
  error: string;
  details?: string[];
  request_id?: string;
}
