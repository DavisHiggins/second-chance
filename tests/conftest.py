"""Shared test configuration.

Puts ``src`` on the import path so that ``pytest`` works from a bare checkout
without anyone having to remember to set ``PYTHONPATH`` or install the package
first. ``pip install -e .`` also works and is what CI does; this is here so that
a reader who has just cloned the repository can run the suite immediately.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))


@pytest.fixture(scope="session")
def rng() -> np.random.Generator:
    """One seeded generator for the whole session.

    Seeded, because a test that fails one run in twenty is worse than no test:
    people learn to rerun it rather than read it.
    """
    return np.random.default_rng(20260820)


@pytest.fixture
def scored_sample(rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """A labelled sample with a genuinely informative, roughly calibrated score.

    Built by drawing a latent probability and then drawing the label from it, so
    the score really is the generating probability. Any calibration metric
    computed on this should come out close to perfect, which is what makes it a
    usable reference point for the tests below.
    """
    probability = rng.beta(2.0, 4.0, size=4000)
    label = rng.binomial(1, probability).astype(float)
    return label, probability


@pytest.fixture
def episode_frame() -> pd.DataFrame:
    """A small survival frame with all three event codes present.

    Deterministic rather than random: 300 rows laid out by hand so that the
    counts in the assertions can be reasoned about rather than measured.
    """
    n = 300
    duration = np.concatenate(
        [
            np.linspace(1, 40, 120),  # adopted, early
            np.linspace(1, 90, 120),  # competing exit, spread out
            np.linspace(200, 400, 60),  # still present at the cutoff
        ]
    )
    code = np.concatenate([np.ones(120), np.full(120, 2.0), np.zeros(60)]).astype(int)
    return pd.DataFrame(
        {
            "length_of_stay_days": duration,
            "event_code": code,
            "is_adopted": (code == 1).astype(int),
            "age_at_intake_days": np.tile([30.0, 200.0, 900.0, 3000.0], n // 4),
            "animal_type": np.tile(["Dog", "Cat"], n // 2),
        }
    )
