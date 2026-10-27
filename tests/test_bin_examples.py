"""Tests for the runnable examples in bin/.

The examples are the first code a new reader runs, so a broken one costs more
than a broken internal helper: it is the README's promise that fails. These
tests run each example on a freshly generated sample, small enough to finish in
a few seconds, and check that the committed sample is still what the generator
writes.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
BIN = ROOT / "bin"


def _load(name: str):
    """Import a script from bin/ as a module, without running its main()."""
    spec = importlib.util.spec_from_file_location(f"bin_{name}", BIN / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def sample(tmp_path_factory):
    """A small sample written by the generator, in the Austin CSV layout."""
    generator = _load("make_sample_data")
    directory = tmp_path_factory.mktemp("sample")
    assert generator.main(["--intakes", "1500", "--output-dir", str(directory)]) == 0
    return directory / "aac_intakes_sample.csv", directory / "aac_outcomes_sample.csv"


def test_generator_is_deterministic():
    generator = _load("make_sample_data")
    first_intakes, first_outcomes = generator.generate(200, seed=7)
    second_intakes, second_outcomes = generator.generate(200, seed=7)
    pd.testing.assert_frame_equal(first_intakes, second_intakes)
    pd.testing.assert_frame_equal(first_outcomes, second_outcomes)
    assert list(first_intakes.columns) == generator.INTAKE_COLUMNS
    assert list(first_outcomes.columns) == generator.OUTCOME_COLUMNS


def test_committed_sample_matches_the_generator():
    """data/sample/ must be exactly what `python bin/make_sample_data.py` writes."""
    generator = _load("make_sample_data")
    intakes, outcomes = generator.generate(3000)
    committed = ROOT / "data" / "sample"
    assert (committed / "aac_intakes_sample.csv").read_text() == intakes.to_csv(index=False)
    assert (committed / "aac_outcomes_sample.csv").read_text() == outcomes.to_csv(index=False)


def test_format_age_matches_austin_strings():
    generator = _load("make_sample_data")
    assert generator.format_age(3) == "3 days"
    assert generator.format_age(7) == "1 week"
    assert generator.format_age(65) == "2 months"
    assert generator.format_age(400) == "1 year"
    assert generator.format_age(800) == "2 years"


def test_quickstart_trains_and_writes_outputs(sample, tmp_path, capsys):
    quickstart = _load("quickstart")
    intakes, outcomes = sample
    code = quickstart.main(
        ["--intakes", str(intakes), "--outcomes", str(outcomes), "--model", "logistic",
         "--output-dir", str(tmp_path)]
    )
    assert code == 0
    assert (tmp_path / "adopted_within_30d_logistic.joblib").exists()
    queue = pd.read_csv(tmp_path / "adopted_within_30d_support_queue.csv")
    # Adoption targets rank the lowest chance first: those animals need the most help.
    assert queue["p_adopted_within_30d"].is_monotonic_increasing
    assert "roc_auc" in capsys.readouterr().out


def test_quickstart_reports_missing_inputs(tmp_path):
    quickstart = _load("quickstart")
    code = quickstart.main(["--intakes", str(tmp_path / "none.csv"), "--outcomes", str(tmp_path / "none.csv")])
    assert code == 1


def test_survival_example_runs(sample, capsys):
    survival = _load("survival_example")
    intakes, outcomes = sample
    assert survival.main(["--intakes", str(intakes), "--outcomes", str(outcomes)]) == 0
    assert "Aalen-Johansen" in capsys.readouterr().out


def test_drift_example_returns_a_verdict(sample, capsys):
    drift = _load("drift_example")
    intakes, outcomes = sample
    assert drift.main(["--intakes", str(intakes), "--outcomes", str(outcomes)]) in {0, 1, 2}
    assert "features checked" in capsys.readouterr().out
