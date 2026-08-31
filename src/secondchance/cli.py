"""Command line interface for SecondChance.

Installed as the ``secondchance`` console script. Everything here is a thin
wrapper over the library: the CLI parses arguments, prints results and sets an
exit code, and does no analysis of its own. That split is deliberate, because a
number that only exists inside a CLI invocation is a number nobody can test.

Five commands:

    build       reconstruct episodes and build the feature matrix
    train       fit and calibrate one target, report held-out metrics
    score       score a cohort and write predictions
    monitor     compare a window against a reference and report drift
    audit       print the data quality counts the paper quotes

Run ``secondchance <command> --help`` for the arguments of any one of them.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

log = logging.getLogger("secondchance")

DEFAULT_CUTOFF = "2022-03-04 11:25:00"


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(levelname)s %(message)s",
        stream=sys.stderr,
    )


def _emit(payload: dict[str, Any], as_json: bool) -> None:
    """Print a result either as JSON or as an aligned key-value block.

    The JSON form exists so this can be piped into anything. The human form exists
    because a wall of JSON at the end of a two minute command is not a report.
    """
    if as_json:
        print(json.dumps(payload, indent=2, default=str))
        return
    width = max((len(k) for k in payload), default=0)
    for key, value in payload.items():
        if isinstance(value, float):
            print(f"{key:<{width}}  {value:.4f}")
        else:
            print(f"{key:<{width}}  {value}")


# -----------------------------------------------------------------------------
# build
# -----------------------------------------------------------------------------


def command_build(args: argparse.Namespace) -> int:
    """Reconstruct episodes from the two event logs and build the feature matrix."""
    from .episodes import build_episodes, label_horizons, load_intakes, load_outcomes
    from .features import ALL_FEATURES, build_features

    intakes = load_intakes(args.intakes)
    outcomes = load_outcomes(args.outcomes)
    log.info("Read %d intake rows and %d outcome rows", len(intakes), len(outcomes))

    cutoff = pd.Timestamp(args.data_cutoff)
    episodes, audit = build_episodes(intakes, outcomes, cutoff)
    labelled = label_horizons(episodes, data_cutoff=cutoff)

    weather = None
    if args.weather:
        weather = pd.read_csv(args.weather)
        weather["date"] = pd.to_datetime(weather["date"])

    features = build_features(labelled, weather=weather, breed_strategy=args.breed_strategy)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    features.to_parquet(output, index=False)

    if args.audit_output:
        Path(args.audit_output).write_text(
            json.dumps(audit.as_dict(), indent=2, default=str), encoding="utf-8"
        )

    _emit(
        {
            "episodes_built": audit.episodes_built,
            "episodes_matched": audit.episodes_matched,
            "episodes_open_at_cutoff": audit.episodes_open_at_cutoff,
            "suspected_missing_outcomes": audit.suspected_missing_outcomes,
            "negative_durations_dropped": audit.negative_duration_dropped,
            "species_mismatches_flagged": audit.species_mismatch_flagged,
            "features_built": len(ALL_FEATURES),
            "written_to": str(output),
        },
        args.json,
    )
    # A negative duration or a species mismatch means the pairing is wrong, and
    # everything downstream would be quietly wrong with it. Exit non-zero so a
    # Makefile or a CI job stops here rather than training on it.
    return 1 if (audit.negative_duration_dropped or audit.species_mismatch_flagged) else 0


# -----------------------------------------------------------------------------
# train
# -----------------------------------------------------------------------------


def command_train(args: argparse.Namespace) -> int:
    """Fit one model on the training block, calibrate on validation, report on test."""
    import joblib

    from .features import DEPLOYMENT_FEATURES, build_cohort
    from .modeling import DEFAULT_SPLIT, RANDOM_SEED, evaluate_binary, fit_calibrated, make_model

    frame = pd.read_parquet(args.features)
    # The same cohort definition the paper uses. Without it this command would
    # report a different, better looking AUC than the results table, computed on a
    # population that includes bats and owner-requested euthanasia, and nobody
    # would be able to tell which of the two numbers was the real one.
    frame, exclusions = build_cohort(frame)
    log.info("Cohort: %s", exclusions)
    frame["block"] = DEFAULT_SPLIT.assign(frame["intake_datetime"])

    usable = frame.loc[frame[args.target].notna()].copy()
    train = usable.loc[usable["block"] == "train"]
    valid = usable.loc[usable["block"] == "valid"]
    test = usable.loc[usable["block"] == "test"]

    if min(len(train), len(valid), len(test)) == 0:
        print("One of the three blocks is empty; check the split dates.", file=sys.stderr)
        return 1

    columns = list(DEPLOYMENT_FEATURES)
    model = make_model(args.model, columns)
    base, calibrated = fit_calibrated(
        model,
        train[columns],
        train[args.target].to_numpy(),
        valid[columns],
        valid[args.target].to_numpy(),
    )

    y_test = test[args.target].to_numpy()
    metrics = evaluate_binary(y_test, calibrated.predict_proba(test[columns])[:, 1])

    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "base_model": base,
                "calibrated_model": calibrated,
                "feature_columns": columns,
                "target": args.target,
                "split": DEFAULT_SPLIT.as_dict(),
                "random_seed": RANDOM_SEED,
            },
            output,
        )

    _emit(
        {
            "target": args.target,
            "model": args.model,
            "n_cohort": exclusions["episodes_final"],
            "n_train": len(train),
            "n_valid": len(valid),
            "n_test": len(test),
            "test_positive_rate": metrics["positive_rate"],
            "test_roc_auc": metrics["roc_auc"],
            "test_pr_auc": metrics["pr_auc"],
            "test_brier": metrics["brier"],
            "test_ece": metrics["ece"],
            "test_calibration_slope": metrics["calibration_slope"],
            "test_precision_at_50": metrics["precision_at_50"],
            "test_lift_at_50": metrics["lift_at_50"],
            "written_to": args.output or "(not saved)",
        },
        args.json,
    )
    return 0


# -----------------------------------------------------------------------------
# score
# -----------------------------------------------------------------------------


def command_score(args: argparse.Namespace) -> int:
    """Score a cohort with a saved model and write the predictions out.

    Prints the use policy on every run. It is not decoration: a scored file that
    leaves this machine without its intended use attached is exactly how a queue
    meant to add help gets read as a queue for taking it away.
    """
    import joblib

    bundle = joblib.load(args.model)
    frame = pd.read_parquet(args.features)
    columns = bundle["feature_columns"]

    missing = [c for c in columns if c not in frame.columns]
    if missing:
        print(f"Feature matrix is missing {len(missing)} columns: {missing[:5]}", file=sys.stderr)
        return 1

    scores = bundle["calibrated_model"].predict_proba(frame[columns])[:, 1]
    predictions = pd.DataFrame(
        {
            "episode_id": frame.get("episode_id", pd.Series(range(len(frame)))),
            "animal_id": frame.get("animal_id"),
            "intake_datetime": frame.get("intake_datetime"),
            f"p_{bundle['target']}": scores,
        }
    )

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    predictions.to_parquet(output, index=False)

    _emit(
        {
            "target": bundle["target"],
            "n_scored": len(predictions),
            "mean_predicted": float(scores.mean()),
            "min_predicted": float(scores.min()),
            "max_predicted": float(scores.max()),
            "written_to": str(output),
        },
        args.json,
    )
    print(
        "\nUse policy: these scores exist to prioritise photography, foster placement,\n"
        "behaviour support and outreach for the animals expected to wait longest. They\n"
        "must never inform euthanasia, intake refusal, or any decision that reduces the\n"
        "care an animal receives. A low predicted adoption probability is a request for\n"
        "more help, not less.",
        file=sys.stderr,
    )
    return 0


# -----------------------------------------------------------------------------
# monitor
# -----------------------------------------------------------------------------


def command_monitor(args: argparse.Namespace) -> int:
    """Compare a current window against a reference and print the drift table."""
    from .features import CATEGORICAL_FEATURES
    from .monitor.drift import DriftThresholds, feature_drift_report

    reference = pd.read_parquet(args.reference)
    current = pd.read_parquet(args.current)

    shared = [c for c in reference.columns if c in current.columns]
    categorical = [c for c in shared if c in CATEGORICAL_FEATURES]
    numeric = [
        c
        for c in shared
        if c not in categorical and pd.api.types.is_numeric_dtype(reference[c])
    ]

    report = feature_drift_report(
        reference,
        current,
        numeric,
        categorical,
        DriftThresholds(psi_warning=args.psi_warning, psi_critical=args.psi_critical),
    )

    if args.json:
        print(json.dumps(report.to_dict(orient="records"), indent=2, default=str))
    else:
        with pd.option_context("display.width", 120, "display.max_rows", 60):
            print(report[["feature", "kind", "psi", "ks_statistic", "status"]].to_string(index=False))

    critical = int((report["status"] == "CRITICAL").sum())
    warning = int((report["status"] == "WARNING").sum())
    print(f"\n{critical} critical, {warning} warning, {len(report)} features checked", file=sys.stderr)
    # Exit code carries the verdict so this can gate a deployment step.
    return 2 if critical else (1 if warning else 0)


# -----------------------------------------------------------------------------
# audit
# -----------------------------------------------------------------------------


def command_audit(args: argparse.Namespace) -> int:
    """Print the data quality counts the paper's data section quotes."""
    from .episodes import build_episodes, load_intakes, load_outcomes

    intakes = load_intakes(args.intakes)
    outcomes = load_outcomes(args.outcomes)
    episodes, audit = build_episodes(intakes, outcomes, pd.Timestamp(args.data_cutoff))

    closed = episodes.loc[episodes["is_matched"]]
    payload = audit.as_dict()
    payload.pop("notes", None)
    payload.update(
        {
            "adoption_share_of_exits": float(closed["is_adopted"].mean()) if len(closed) else np.nan,
            "median_stay_days_closed": float(closed["length_of_stay_days"].median())
            if len(closed)
            else np.nan,
            "repeat_visit_share": float((episodes["prior_intake_count"] > 0).mean()),
        }
    )
    _emit(payload, args.json)
    for note in audit.notes:
        print(f"note: {note}", file=sys.stderr)
    return 0


# -----------------------------------------------------------------------------
# argument parsing
# -----------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    """Assemble the full argument parser."""
    parser = argparse.ArgumentParser(
        prog="secondchance",
        description="Competing-risk adoption forecasting for the Austin Animal Center.",
        epilog=(
            "Scores from this system exist to route help toward animals. They must never "
            "be used to justify withholding care."
        ),
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    parser.add_argument("--json", action="store_true", help="emit results as JSON")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build = subparsers.add_parser("build", help="reconstruct episodes and build features")
    build.add_argument("--intakes", required=True, help="Austin intakes CSV")
    build.add_argument("--outcomes", required=True, help="Austin outcomes CSV")
    build.add_argument("--weather", help="optional daily weather CSV with date, tmax, tmin, prcp")
    build.add_argument("--output", required=True, help="parquet path for the feature matrix")
    build.add_argument("--audit-output", help="optional JSON path for the episode audit")
    build.add_argument("--data-cutoff", default=DEFAULT_CUTOFF, help="export cutoff timestamp")
    build.add_argument(
        "--breed-strategy",
        default="llm",
        choices=["llm", "rules", "none"],
        help="which breed structuring to use; the ablation in the paper compares all three",
    )
    build.set_defaults(handler=command_build)

    train = subparsers.add_parser("train", help="fit, calibrate and evaluate one target")
    train.add_argument("--features", required=True, help="feature matrix parquet from build")
    train.add_argument(
        "--target",
        default="adopted_within_30d",
        choices=["adopted_within_7d", "adopted_within_14d", "adopted_within_30d", "long_stay_60d"],
    )
    train.add_argument(
        "--model",
        default="lightgbm",
        choices=["prior", "logistic", "logistic_simple", "lightgbm", "xgboost"],
    )
    train.add_argument("--output", help="optional joblib path for the fitted bundle")
    train.set_defaults(handler=command_train)

    score = subparsers.add_parser("score", help="score a cohort with a saved model")
    score.add_argument("--model", required=True, help="joblib bundle from train")
    score.add_argument("--features", required=True, help="feature matrix parquet")
    score.add_argument("--output", required=True, help="parquet path for the predictions")
    score.set_defaults(handler=command_score)

    monitor = subparsers.add_parser("monitor", help="compare a window against a reference")
    monitor.add_argument("--reference", required=True, help="reference parquet, usually validation")
    monitor.add_argument("--current", required=True, help="current window parquet")
    monitor.add_argument("--psi-warning", type=float, default=0.10)
    monitor.add_argument("--psi-critical", type=float, default=0.25)
    monitor.set_defaults(handler=command_monitor)

    audit = subparsers.add_parser("audit", help="print the data quality counts")
    audit.add_argument("--intakes", required=True)
    audit.add_argument("--outcomes", required=True)
    audit.add_argument("--data-cutoff", default=DEFAULT_CUTOFF)
    audit.set_defaults(handler=command_audit)

    return parser


def main(argv: list[str] | None = None) -> int:
    """Entry point for the ``secondchance`` console script."""
    args = build_parser().parse_args(argv)
    _configure_logging(args.verbose)
    try:
        return int(args.handler(args))
    except FileNotFoundError as error:
        print(f"File not found: {error.filename}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
