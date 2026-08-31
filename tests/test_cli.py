"""Tests for the command line interface and the cohort definition.

The CLI is tested for one reason above the others: it is the path a person takes
who has not read the analysis scripts. If it silently applies a different cohort
from the one the paper uses, it reports a different, better looking AUC, and there
is no way for that person to tell which of the two numbers is the real one. So
there is a test that asserts the cohort filter is actually applied.

Everything runs on synthetic frames written to a temporary directory. No test here
reads the real 40 MB export, because a suite that needs the data downloaded first
is a suite that gets skipped.
"""

from __future__ import annotations

import json
import re

import numpy as np
import pandas as pd
import pytest

from factories import make_intakes, make_outcomes
from secondchance import cli
from secondchance.episodes import build_episodes, label_horizons
from secondchance.features import build_cohort, build_features

CUTOFF = pd.Timestamp("2022-03-04 11:25:00")


@pytest.fixture
def raw_csvs(tmp_path):
    """Two CSVs shaped exactly like Austin's export, small but not degenerate.

    Written in the source format, with the Socrata timestamp and the free-text age
    string, so the CLI exercises the real loaders rather than a shortcut.
    """
    rng = np.random.default_rng(20260820)
    n = 700
    species = rng.choice(["Dog", "Cat", "Bird"], n, p=[0.55, 0.42, 0.03])
    breeds = np.where(
        species == "Dog",
        rng.choice(["Pit Bull Mix", "Labrador Retriever Mix", "Chihuahua Shorthair Mix"], n),
        "Domestic Shorthair Mix",
    )
    ages = rng.choice(["2 years", "6 months", "1 year", "4 weeks", "8 years"], n)
    days = pd.to_datetime("2015-01-01") + pd.to_timedelta(
        rng.integers(0, 2400, n).astype(int), unit="D"
    )
    stay = rng.integers(1, 90, n)

    intakes = pd.DataFrame(
        {
            "Animal ID": [f"A{i:06d}" for i in range(n)],
            "Name": np.where(rng.random(n) < 0.3, None, "*Rufus"),
            "DateTime": days.strftime("%m/%d/%Y %I:%M:%S %p"),
            "MonthYear": days.strftime("%b %Y"),
            "Found Location": "7201 Levander Loop in Austin (TX)",
            "Intake Type": rng.choice(
                ["Stray", "Owner Surrender", "Public Assist", "Wildlife"],
                n,
                p=[0.7, 0.2, 0.07, 0.03],
            ),
            "Intake Condition": rng.choice(["Normal", "Injured", "Sick"], n, p=[0.85, 0.08, 0.07]),
            "Animal Type": species,
            "Sex upon Intake": rng.choice(["Intact Male", "Spayed Female", "Unknown"], n),
            "Age upon Intake": ages,
            "Breed": breeds,
            "Color": rng.choice(["Black/White", "Brown Tabby", "Tan"], n),
        }
    )

    exits = days + pd.to_timedelta(stay.astype(int), unit="D")
    outcomes = pd.DataFrame(
        {
            "Animal ID": intakes["Animal ID"],
            "Name": intakes["Name"],
            "DateTime": exits.strftime("%m/%d/%Y %I:%M:%S %p"),
            "MonthYear": exits.strftime("%b %Y"),
            "Date of Birth": (days - pd.Timedelta(days=400)).strftime("%m/%d/%Y"),
            "Outcome Type": rng.choice(
                ["Adoption", "Transfer", "Return to Owner", "Euthanasia"],
                n,
                p=[0.45, 0.3, 0.2, 0.05],
            ),
            "Outcome Subtype": None,
            "Animal Type": species,
            "Sex upon Outcome": "Neutered Male",
            "Age upon Outcome": ages,
            "Breed": breeds,
            "Color": intakes["Color"],
        }
    )

    intake_path = tmp_path / "intakes.csv"
    outcome_path = tmp_path / "outcomes.csv"
    intakes.to_csv(intake_path, index=False)
    outcomes.to_csv(outcome_path, index=False)
    return intake_path, outcome_path


# --- the cohort definition ----------------------------------------------------


@pytest.fixture
def small_features() -> pd.DataFrame:
    """A feature matrix containing exactly the three things the cohort excludes."""
    rows = [
        {"animal_id": "KEEP1", "intake_datetime": "2018-01-01 09:00", "animal_type": "Dog"},
        {"animal_id": "KEEP2", "intake_datetime": "2018-02-01 09:00", "animal_type": "Cat"},
        {"animal_id": "BIRD", "intake_datetime": "2018-03-01 09:00", "animal_type": "Bird"},
        {
            "animal_id": "WILD",
            "intake_datetime": "2018-04-01 09:00",
            "animal_type": "Dog",
            "intake_type": "Wildlife",
        },
        {
            "animal_id": "EUTHREQ",
            "intake_datetime": "2018-05-01 09:00",
            "animal_type": "Dog",
            "intake_type": "Euthanasia Request",
        },
        # An eight-year-old open episode, which the audit flags as an unfiled form.
        {"animal_id": "LOST", "intake_datetime": "2014-01-01 09:00", "animal_type": "Dog"},
    ]
    closers = [
        {"animal_id": a, "outcome_datetime": "2018-06-01 09:00", "outcome_type": "Adoption"}
        for a in ["KEEP1", "KEEP2", "BIRD", "WILD", "EUTHREQ"]
    ]
    # Enough closed episodes for the 99.5th percentile threshold to be meaningful.
    for i in range(60):
        rows.append(
            {"animal_id": f"F{i}", "intake_datetime": "2018-01-05 09:00", "animal_type": "Dog"}
        )
        closers.append(
            {
                "animal_id": f"F{i}",
                "outcome_datetime": "2018-01-15 09:00",
                "outcome_type": "Adoption",
            }
        )
    episodes, _ = build_episodes(make_intakes(rows), make_outcomes(closers), CUTOFF)
    return build_features(label_horizons(episodes, data_cutoff=CUTOFF), breed_strategy="none")


def test_cohort_excludes_exactly_the_three_documented_groups(small_features):
    """Non dog or cat, off the adoption pathway, and suspected unfiled paperwork."""
    cohort, counts = build_cohort(small_features)
    kept = set(cohort["animal_id"])

    assert "BIRD" not in kept
    assert "WILD" not in kept
    assert "EUTHREQ" not in kept
    assert "LOST" not in kept, "an eight-year open episode is an unfiled form, not a resident"
    assert {"KEEP1", "KEEP2"} <= kept

    assert counts["excluded_not_dog_or_cat"] == 1
    assert counts["excluded_off_adoption_pathway"] == 2
    assert counts["excluded_suspected_missing_outcome"] == 1


def test_cohort_counts_reconcile(small_features):
    """Start minus the three exclusions has to equal the final count, exactly.

    This is asserted rather than assumed because the exclusions are applied in
    sequence, so a filter written against the original frame instead of the
    running one would double count and nobody would notice.
    """
    _, counts = build_cohort(small_features)
    assert counts["episodes_final"] == (
        counts["episodes_start"]
        - counts["excluded_not_dog_or_cat"]
        - counts["excluded_off_adoption_pathway"]
        - counts["excluded_suspected_missing_outcome"]
    )


def test_cohort_does_not_mutate_its_input(small_features):
    """Four analysis scripts call this on the same frame."""
    before = len(small_features)
    build_cohort(small_features)
    assert len(small_features) == before


def test_cohort_reindexes_so_positional_lookups_are_safe(small_features):
    """Downstream code indexes predictions positionally against this frame."""
    cohort, _ = build_cohort(small_features)
    assert list(cohort.index) == list(range(len(cohort)))


# --- the CLI ------------------------------------------------------------------


def test_audit_reports_the_counts_and_exits_clean(raw_csvs, capsys):
    intakes, outcomes = raw_csvs
    code = cli.main(["--json", "audit", "--intakes", str(intakes), "--outcomes", str(outcomes)])
    assert code == 0

    payload = json.loads(capsys.readouterr().out)
    assert payload["intake_rows"] == 700
    assert payload["outcome_rows"] == 700
    assert payload["negative_duration_dropped"] == 0
    assert payload["species_mismatch_flagged"] == 0
    assert 0.0 <= payload["adoption_share_of_exits"] <= 1.0


def test_build_writes_a_feature_matrix_and_an_audit(raw_csvs, tmp_path, capsys):
    intakes, outcomes = raw_csvs
    features = tmp_path / "features.parquet"
    audit = tmp_path / "audit.json"

    code = cli.main(
        [
            "--json", "build",
            "--intakes", str(intakes),
            "--outcomes", str(outcomes),
            "--output", str(features),
            "--audit-output", str(audit),
        ]
    )
    assert code == 0
    assert features.exists()

    frame = pd.read_parquet(features)
    assert len(frame) == 700
    from secondchance.features import ALL_FEATURES

    assert not [c for c in ALL_FEATURES if c not in frame.columns]

    recorded = json.loads(audit.read_text())
    assert recorded["episodes_built"] == 700

    payload = json.loads(capsys.readouterr().out)
    assert payload["features_built"] == len(ALL_FEATURES)


def test_build_creates_its_output_directory(raw_csvs, tmp_path):
    """So that a first run into a fresh checkout does not fail on a missing folder."""
    intakes, outcomes = raw_csvs
    output = tmp_path / "nested" / "deeper" / "features.parquet"
    assert cli.main(
        ["build", "--intakes", str(intakes), "--outcomes", str(outcomes), "--output", str(output)]
    ) == 0
    assert output.exists()


def test_build_accepts_every_breed_strategy(raw_csvs, tmp_path):
    intakes, outcomes = raw_csvs
    for strategy in ["llm", "rules", "none"]:
        output = tmp_path / f"features_{strategy}.parquet"
        code = cli.main(
            [
                "build", "--intakes", str(intakes), "--outcomes", str(outcomes),
                "--output", str(output), "--breed-strategy", strategy,
            ]
        )
        assert code == 0, strategy


def test_train_applies_the_same_cohort_as_the_paper(raw_csvs, tmp_path, capsys):
    """The test this file exists for.

    A CLI that skips the cohort filter reports a different, better looking AUC than
    the results table, computed on a population that includes birds and
    owner-requested euthanasia, and there is no way for a reader to tell which of
    the two numbers is real.
    """
    intakes, outcomes = raw_csvs
    features = tmp_path / "features.parquet"
    cli.main(
        ["build", "--intakes", str(intakes), "--outcomes", str(outcomes), "--output", str(features)]
    )
    capsys.readouterr()

    assert cli.main(
        ["--json", "train", "--features", str(features), "--target", "adopted_within_30d",
         "--model", "logistic"]
    ) == 0

    payload = json.loads(capsys.readouterr().out)
    frame = pd.read_parquet(features)
    expected, _ = build_cohort(frame)

    assert payload["n_cohort"] == len(expected)
    assert payload["n_cohort"] < len(frame), "the cohort filter did nothing"
    assert payload["n_train"] + payload["n_valid"] + payload["n_test"] <= payload["n_cohort"]


def test_train_saves_a_bundle_that_score_can_read(raw_csvs, tmp_path, capsys):
    intakes, outcomes = raw_csvs
    features = tmp_path / "features.parquet"
    model = tmp_path / "model.joblib"
    predictions = tmp_path / "predictions.parquet"

    cli.main(
        ["build", "--intakes", str(intakes), "--outcomes", str(outcomes), "--output", str(features)]
    )
    cli.main(
        ["train", "--features", str(features), "--target", "adopted_within_30d",
         "--model", "logistic", "--output", str(model)]
    )
    capsys.readouterr()

    assert model.exists()
    assert cli.main(
        ["--json", "score", "--model", str(model), "--features", str(features),
         "--output", str(predictions)]
    ) == 0

    payload = json.loads(capsys.readouterr().out)
    assert payload["n_scored"] == 700
    assert 0.0 <= payload["min_predicted"] <= payload["max_predicted"] <= 1.0

    scored = pd.read_parquet(predictions)
    assert "p_adopted_within_30d" in scored.columns
    assert scored["p_adopted_within_30d"].between(0, 1).all()


def test_score_prints_the_use_policy(raw_csvs, tmp_path, capsys):
    """Every scored file that leaves this machine carries its intended use.

    A queue meant to add help gets read as a queue for taking it away exactly when
    the numbers travel without the sentence explaining them.
    """
    intakes, outcomes = raw_csvs
    features = tmp_path / "features.parquet"
    model = tmp_path / "model.joblib"

    cli.main(
        ["build", "--intakes", str(intakes), "--outcomes", str(outcomes), "--output", str(features)]
    )
    cli.main(
        ["train", "--features", str(features), "--target", "adopted_within_30d",
         "--model", "logistic", "--output", str(model)]
    )
    cli.main(
        ["score", "--model", str(model), "--features", str(features),
         "--output", str(tmp_path / "p.parquet")]
    )
    stderr = capsys.readouterr().err
    assert "must never inform euthanasia" in stderr
    assert "more help, not less" in stderr


def test_score_refuses_a_feature_matrix_missing_columns(raw_csvs, tmp_path, capsys):
    intakes, outcomes = raw_csvs
    features = tmp_path / "features.parquet"
    model = tmp_path / "model.joblib"
    cli.main(
        ["build", "--intakes", str(intakes), "--outcomes", str(outcomes), "--output", str(features)]
    )
    cli.main(
        ["train", "--features", str(features), "--target", "adopted_within_30d",
         "--model", "logistic", "--output", str(model)]
    )
    truncated = tmp_path / "truncated.parquet"
    pd.read_parquet(features).drop(columns=["age_at_intake_days"]).to_parquet(truncated)
    capsys.readouterr()

    assert cli.main(
        ["score", "--model", str(model), "--features", str(truncated),
         "--output", str(tmp_path / "p.parquet")]
    ) == 1
    assert "missing" in capsys.readouterr().err


def test_monitor_exit_code_carries_the_verdict(tmp_path, capsys):
    """0 clean, 1 warning, 2 critical, so this can gate a deployment step."""
    rng = np.random.default_rng(20260820)
    reference = pd.DataFrame(
        {"age_at_intake_days": rng.gamma(2, 400, 3000), "animal_type": rng.choice(["Dog", "Cat"], 3000)}
    )
    same = pd.DataFrame(
        {"age_at_intake_days": rng.gamma(2, 400, 3000), "animal_type": rng.choice(["Dog", "Cat"], 3000)}
    )
    shifted = pd.DataFrame(
        {
            "age_at_intake_days": rng.gamma(2, 400, 3000) * 3.5,
            "animal_type": rng.choice(["Dog", "Cat"], 3000, p=[0.05, 0.95]),
        }
    )
    reference.to_parquet(tmp_path / "reference.parquet")
    same.to_parquet(tmp_path / "same.parquet")
    shifted.to_parquet(tmp_path / "shifted.parquet")

    quiet = cli.main(
        ["monitor", "--reference", str(tmp_path / "reference.parquet"),
         "--current", str(tmp_path / "same.parquet")]
    )
    capsys.readouterr()
    loud = cli.main(
        ["monitor", "--reference", str(tmp_path / "reference.parquet"),
         "--current", str(tmp_path / "shifted.parquet")]
    )
    capsys.readouterr()

    assert quiet == 0, "an unchanged distribution must not raise anything"
    assert loud == 2, "a large shift must return the critical exit code"


def test_a_missing_input_file_is_a_clear_message_not_a_traceback(tmp_path, capsys):
    code = cli.main(
        ["audit", "--intakes", str(tmp_path / "nope.csv"), "--outcomes", str(tmp_path / "nope.csv")]
    )
    assert code == 2
    assert "File not found" in capsys.readouterr().err


def test_an_unknown_command_is_refused():
    with pytest.raises(SystemExit):
        cli.main(["hallucinate"])


def test_the_parser_advertises_the_use_policy():
    """It is in the epilogue of `--help`, where someone reaching for the tool sees it."""
    parser = cli.build_parser()
    assert "route help toward animals" in parser.epilog
    assert "withholding care" in parser.epilog


def test_json_output_is_machine_readable(raw_csvs, capsys):
    """So the CLI can be piped into something rather than only read."""
    intakes, outcomes = raw_csvs
    cli.main(["--json", "audit", "--intakes", str(intakes), "--outcomes", str(outcomes)])
    json.loads(capsys.readouterr().out)


def test_human_output_aligns_its_keys(raw_csvs, capsys):
    intakes, outcomes = raw_csvs
    cli.main(["audit", "--intakes", str(intakes), "--outcomes", str(outcomes)])
    lines = [line for line in capsys.readouterr().out.splitlines() if line.strip()]
    assert len(lines) > 5

    # Every line is "key<padding>value". Split on the run of whitespace rather
    # than on a fixed two spaces, because the padding varies by key length and
    # measuring it the other way tests the test rather than the output.
    columns = set()
    for line in lines:
        match = re.match(r"^(\S+)(\s+)(\S.*)$", line)
        assert match is not None, f"unparseable output line: {line!r}"
        columns.add(len(match.group(1)) + len(match.group(2)))
    assert len(columns) == 1, f"values start at inconsistent columns: {sorted(columns)}"
