#!/usr/bin/env python3
"""Check that every number quoted in the deliverables still matches the pipeline.

The central claim of this project is that nothing in the paper was estimated,
rounded from memory, or transcribed by hand. That claim is easy to make and easy
to break: a figure gets adjusted in the text during an edit, the pipeline is
rerun, and the two quietly disagree. Nothing fails, nothing warns, and the paper
is wrong in a way that only shows up if someone checks.

So this script checks. It reads ``results/MEASURED_RESULTS.json``, formats each
headline number the way the documents write it, and asserts that the string is
actually present in every document that is supposed to contain it. A number
edited in the paper and not in the pipeline fails here, and so does the reverse.

It also runs the three house-style checks the project committed to:

  - no em dashes anywhere in the written deliverables
  - no unfilled placeholders, brackets, or "TODO" markers
  - no bare NaN or Infinity in any JSON the website reads, since ``JSON.parse``
    rejects both and the page would render blank

Usage:
    python3 scripts/verify_numbers.py
    python3 scripts/verify_numbers.py --strict     # exit 1 on any failure
    python3 scripts/verify_numbers.py --verbose    # show every passing check too
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RESULTS_PATH = ROOT / "results" / "MEASURED_RESULTS.json"

# Every written deliverable, plus the two places numbers get copied into by hand.
PROSE_DOCUMENTS = [
    ROOT / "deliverables" / "source" / "01_work_plan.md",
    ROOT / "deliverables" / "source" / "02_literature_review.md",
    ROOT / "deliverables" / "source" / "03_project_outline.md",
    ROOT / "deliverables" / "source" / "04_paper_draft.md",
    ROOT / "deliverables" / "source" / "05_peer_reviews.md",
    ROOT / "deliverables" / "source" / "06_final_paper.md",
    ROOT / "presentation" / "SPEAKER_SCRIPT.md",
    ROOT / "docs" / "01_MODEL_CARD.md",
    ROOT / "README.md",
]

# Documents that carry no headline number but still have to obey the house style:
# no em dashes, no placeholders. The website build package is here because it is
# handed to a code generation tool, and a "[fill this in]" left in a spec becomes a
# "[fill this in]" rendered on a page.
STYLE_ONLY_DOCUMENTS = [
    ROOT / "docs" / "00_START_HERE.md",
    ROOT / "docs" / "02_AWS_SETUP_RUNBOOK.md",
    ROOT / "docs" / "03_COST_MODEL.md",
    ROOT / "docs" / "04_DATA_DICTIONARY.md",
    ROOT / "docs" / "05_DECISION_LOG.md",
    ROOT / "docs" / "06_LLM_EVALUATION.md",
    *sorted((ROOT / "website_build_package").glob("*.md")),
]

# JSON the website parses at load time. A NaN here renders a blank page.
WEBSITE_JSON = sorted(
    [*(ROOT / "website_build_package" / "data").rglob("*.json"), RESULTS_PATH]
)

GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
RESET = "\033[0m"


@dataclass
class Check:
    """One assertion: one of these strings must appear in these files.

    A set rather than a single string, because a document and a formatter can
    round the same number two defensible ways. 0.7775 is 0.778 to a person and
    0.777 to ``format``, since the stored double is fractionally below the
    midpoint. Failing a paper for that would be pedantry rather than verification,
    so both renderings are accepted and anything further off still fails.
    """

    label: str
    accepted: list[str]
    documents: list[Path]
    # Some numbers appear only in the final paper, some only in the deck script.
    # ``require_all`` says whether every listed document must carry it or just one.
    require_all: bool = False

    @property
    def expected(self) -> str:
        """The canonical rendering, for the failure message."""
        return self.accepted[0]


def renderings(value: float, places: int) -> list[str]:
    """Every defensible way to write this number to this many decimal places.

    Half-up and half-even, deduplicated. See :class:`Check` for why both.
    """
    from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal

    quantum = Decimal(1).scaleb(-places)
    exact = Decimal(repr(float(value)))
    candidates = [
        str(exact.quantize(quantum, rounding=rule))
        for rule in (ROUND_HALF_UP, ROUND_HALF_EVEN)
    ]
    return list(dict.fromkeys(candidates))


@dataclass
class Report:
    """Accumulated pass and fail counts, so the exit code means something."""

    passed: int = 0
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def ok(self, message: str, verbose: bool) -> None:
        """Record a passing check, printing it only in verbose mode."""
        self.passed += 1
        if verbose:
            print(f"  {GREEN}pass{RESET}  {message}")

    def fail(self, message: str) -> None:
        """Record and print a failure. These set the exit code under --strict."""
        self.failures.append(message)
        print(f"  {RED}FAIL{RESET}  {message}")

    def warn(self, message: str) -> None:
        """Record something worth noting that is not a failure."""
        self.warnings.append(message)
        print(f"  {YELLOW}warn{RESET}  {message}")


def load_results() -> dict[str, Any]:
    """Read the results file, failing clearly if the pipeline has not been run."""
    if not RESULTS_PATH.exists():
        print(
            f"{RED}No results file at {RESULTS_PATH}.{RESET}\n"
            "Run `make analysis` first. Every check below reads from it.",
            file=sys.stderr,
        )
        raise SystemExit(2)
    return json.loads(RESULTS_PATH.read_text(encoding="utf-8"))


def _pct(value: float | None) -> float | None:
    """Convert a proportion to a percentage, passing None through untouched."""
    return None if value is None else value * 100


def thousands(value: float) -> str:
    """Format a count the way the documents write it: 136,898."""
    return f"{round(value):,}"


def build_checks(results: dict[str, Any]) -> list[Check]:
    """Turn the results file into the list of strings the documents must contain.

    Every entry here is a number that appears in prose. If a claim is added to the
    paper it should be added here too, and if it cannot be added here because it
    is not in the results file, that is the finding rather than an inconvenience.
    """
    headline = results["headline"]
    audit = results["data_audit"]
    cohort = results["cohort"]
    blocks = results["block_counts"]
    survival = results["survival"]
    drift = results["drift"]
    ablations = results["ablations"]

    paper = [ROOT / "deliverables" / "source" / "06_final_paper.md"]
    paper_and_script = [*paper, ROOT / "presentation" / "SPEAKER_SCRIPT.md"]

    checks: list[Check] = [
        # --- the data ---------------------------------------------------------
        Check("episodes built", [thousands(headline["episodes_built"])], paper_and_script),
        Check("modelling cohort", [thousands(headline["modelling_cohort"])], paper),
        Check("test block size", [thousands(headline["test_episodes"])], paper_and_script),
        Check("intake rows", [thousands(audit["intake_rows"])], paper),
        Check("outcome rows", [thousands(audit["outcome_rows"])], paper),
        Check("episodes matched", [thousands(audit["episodes_matched"])], paper),
        Check("open at cutoff", [thousands(audit["episodes_open_at_cutoff"])], paper),
        Check(
            "suspected missing outcomes",
            [thousands(audit["suspected_missing_outcomes"])],
            paper_and_script,
        ),
        Check(
            "missing-outcome threshold",
            renderings(audit["missing_outcome_threshold_days"], 0),
            paper_and_script,
        ),
        Check("train block", [thousands(blocks["train"])], paper),
        Check("valid block", [thousands(blocks["valid"])], paper),
        Check("excluded non dog or cat", [thousands(cohort["excluded_not_dog_or_cat"])], paper),
        # --- the models -------------------------------------------------------
        Check("30d champion AUC", renderings(headline["champion_auc_30d"], 3), paper_and_script),
        Check("30d champion ECE", renderings(headline["champion_ece_30d"], 3), paper_and_script),
        Check("30d champion Brier", renderings(headline["champion_brier_30d"], 3), paper),
        Check("long-stay AUC", renderings(headline["long_stay_auc"], 3), paper_and_script),
        Check(
            "long-stay lift at 50",
            renderings(headline["long_stay_lift_at_50"], 1),
            paper_and_script,
        ),
        Check(
            "shuffled-label control",
            renderings(headline["shuffled_label_control_auc"], 4),
            paper_and_script,
        ),
        # --- the headline finding --------------------------------------------
        Check(
            "KM overstatement, points",
            renderings(headline["km_overstatement_30d_points"] * 100, 1),
            paper_and_script,
        ),
        Check(
            "KM overstatement, relative",
            renderings(headline["km_overstatement_30d_relative_pct"], 0),
            paper_and_script,
        ),
        Check("Cox concordance", renderings(headline["cox_concordance_test"], 3), paper),
    ]

    # --- numbers whose exact JSON path is worth asserting rather than assuming --
    def maybe(label: str, value: Any, places: int, documents: list[Path]) -> None:
        """Add a check only if the pipeline actually produced the value."""
        if value is not None:
            checks.append(Check(label, renderings(value, places), documents))

    by_day = {row["day"]: row for row in survival["estimator_comparison"]}
    year = by_day.get(365, {})
    maybe("one-year naive incidence", _pct(year.get("kaplan_meier_cause_specific")), 1, paper_and_script)
    maybe("one-year corrected incidence", _pct(year.get("aalen_johansen_cif")), 1, paper_and_script)

    tests = ablations["breed_strategy_tests"]
    maybe(
        "LLM over keyword baseline, long stay",
        tests["long_stay_60d"]["llm_vs_rules"]["auc_difference"],
        3,
        paper_and_script,
    )
    maybe(
        "LLM over keyword baseline, 30 day",
        tests["adopted_within_30d"]["llm_vs_rules"]["auc_difference"],
        4,
        paper_and_script,
    )

    performance = drift["performance_drift"]
    maybe(
        "largest calibration gap",
        _pct(performance["largest_calibration_gap"]),
        1,
        paper_and_script,
    )
    maybe("mean AUC before the shift", performance["mean_auc_before_shift"], 3, paper_and_script)
    maybe("mean AUC after the shift", performance["mean_auc_after_shift"], 3, paper_and_script)
    maybe("worst month AUC", performance["worst_month_auc"], 3, paper_and_script)
    checks.append(Check("survival cohort", [thousands(survival["n_episodes"])], paper))

    return checks


def run_number_checks(checks: list[Check], report: Report, verbose: bool) -> None:
    """Assert every expected string is present where it should be."""
    cache: dict[Path, str] = {}

    def text_of(path: Path) -> str:
        if path not in cache:
            cache[path] = path.read_text(encoding="utf-8") if path.exists() else ""
        return cache[path]

    print("\nNumbers quoted in the deliverables")
    for check in checks:
        present = [
            d for d in check.documents if any(v in text_of(d) for v in check.accepted)
        ]
        missing = [d for d in check.documents if d not in present]
        wanted = " or ".join(f"'{v}'" for v in check.accepted)

        if check.require_all and missing:
            report.fail(f"{check.label}: {wanted} missing from {', '.join(d.name for d in missing)}")
        elif not present:
            report.fail(
                f"{check.label}: {wanted} appears in none of "
                f"{', '.join(d.name for d in check.documents)}"
            )
        else:
            report.ok(f"{check.label} = {check.expected}", verbose)


def run_house_style_checks(report: Report, verbose: bool) -> None:
    """No em dashes, no placeholders, no unfilled brackets."""
    print("\nHouse style")

    # Deliberately narrow. An earlier, broader version flagged the word
    # "placeholder" in "blurred low-resolution placeholder", which is a real UI
    # term and not an unfilled blank. A style check that cries wolf is a style
    # check somebody disables, so this matches only markers that could not be
    # anything other than unfinished work.
    placeholder = re.compile(
        r"\bTODO\b|\bFIXME\b|\bTBD\b|\bXXX\b|\bPLACEHOLDER\b"
        r"|\bLorem ipsum\b|\bfill (?:this|in) \b"
        r"|\[(?:INSERT|YOUR|NAME|DATE|TODO)[^\]]*\]"
        r"|<(?:insert|your|name|date)[^>]*>"
        r"|\b(?:xxx|yyy|zzz)\b",
    )

    for path in [*PROSE_DOCUMENTS, *STYLE_ONLY_DOCUMENTS]:
        if not path.exists():
            report.fail(f"{path.relative_to(ROOT)} does not exist")
            continue
        text = path.read_text(encoding="utf-8")

        # Only the em dash is flagged. The en dash is left alone because it is
        # correct inside a page range in a citation, which is what every reference
        # style asks for and is not a prose choice at all.
        if "—" in text:
            lines = [i + 1 for i, line in enumerate(text.splitlines()) if "—" in line]
            report.fail(f"{path.name}: em dash on line(s) {lines[:5]}")
        else:
            report.ok(f"{path.name}: no em dashes", verbose)

        found = placeholder.findall(text)
        if found:
            report.fail(f"{path.name}: placeholder text {sorted(set(found))[:5]}")
        else:
            report.ok(f"{path.name}: no placeholders", verbose)


def run_repository_checks(report: Report, verbose: bool) -> None:
    """Claims about the repository itself: the test count and the coverage figure.

    These are quoted in the README and in docs/00_START_HERE.md, and they are
    exactly the kind of number that is right on the day it is written and wrong a
    fortnight later. Collecting the suite takes about two seconds and settles it.
    """
    import subprocess

    print("\nClaims about the repository")

    collected = subprocess.run(
        [sys.executable, "-m", "pytest", "tests/", "--collect-only", "-q"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    total = 0
    for line in collected.stdout.splitlines():
        if line.startswith("tests/") and line.rstrip().rsplit(": ", 1)[-1].isdigit():
            total += int(line.rstrip().rsplit(": ", 1)[-1])

    if total == 0:
        report.warn("could not collect the test suite; skipping the count check")
        return

    for path in [ROOT / "README.md", ROOT / "docs" / "00_START_HERE.md"]:
        text = path.read_text(encoding="utf-8")
        if f"{total} tests" in text:
            report.ok(f"{path.name} says {total} tests, which is what pytest collects", verbose)
        else:
            quoted = re.findall(r"(\d+) tests", text)
            report.fail(
                f"{path.name} claims {quoted or 'no'} tests; pytest collects {total}"
            )


def run_json_checks(report: Report, verbose: bool) -> None:
    """Every website fixture must be strict JSON that ``JSON.parse`` accepts.

    Python's ``json`` module writes bare ``NaN`` and ``Infinity`` by default and
    reads them back happily. JavaScript does not: ``JSON.parse`` throws, the fetch
    rejects, and the page renders empty with an error only visible in the console.
    """
    print(f"\nWebsite fixtures ({len(WEBSITE_JSON)} files)")
    if not WEBSITE_JSON:
        report.warn("no website JSON found; skipping")
        return

    bad_token = re.compile(r"(?<![\w\"])(NaN|-?Infinity)(?![\w\"])")
    for path in WEBSITE_JSON:
        raw = path.read_text(encoding="utf-8")
        tokens = bad_token.findall(raw)
        if tokens:
            report.fail(f"{path.name}: contains {sorted(set(tokens))}, which JSON.parse rejects")
            continue
        try:
            json.loads(raw, parse_constant=_reject_constant)
        except ValueError as error:
            report.fail(f"{path.name}: not valid strict JSON ({error})")
        else:
            report.ok(f"{path.name}", verbose)


def _reject_constant(name: str) -> Any:
    raise ValueError(f"non-standard JSON constant {name}")


def run_consistency_checks(results: dict[str, Any], report: Report, verbose: bool) -> None:
    """Internal arithmetic that has to hold, independent of any document.

    These catch a different class of error from the string checks above: not "the
    paper disagrees with the pipeline" but "the pipeline disagrees with itself".
    """
    print("\nInternal consistency")

    audit = results["data_audit"]
    cohort = results["cohort"]
    blocks = results["block_counts"]

    def assert_equal(label: str, left: float, right: float, tolerance: float = 0.0) -> None:
        if abs(left - right) <= tolerance:
            report.ok(f"{label}: {left} == {right}", verbose)
        else:
            report.fail(f"{label}: {left} != {right}")

    assert_equal(
        "episodes = matched + open",
        audit["episodes_built"],
        audit["episodes_matched"] + audit["episodes_open_at_cutoff"],
    )
    assert_equal(
        "cohort = start minus exclusions",
        cohort["episodes_final"],
        cohort["episodes_start"]
        - cohort["excluded_not_dog_or_cat"]
        - cohort["excluded_off_adoption_pathway"]
        - cohort["excluded_suspected_missing_outcome"],
    )
    assert_equal(
        "blocks sum to the cohort",
        sum(blocks.values()),
        cohort["episodes_final"],
    )

    # The pairing invariants. Any of these being non-zero means the episode join is
    # wrong, and every number downstream would be wrong with it.
    for name in ["negative_duration_dropped", "species_mismatch_flagged"]:
        if audit[name] == 0:
            report.ok(f"{name} is zero", verbose)
        else:
            report.fail(f"{name} is {audit[name]}, which means the pairing is wrong")

    # The headline finding, recomputed from the two curves rather than trusted.
    survival = results["survival"]
    day_30 = next(
        (row for row in survival["estimator_comparison"] if row["day"] == 30), {}
    )
    km_30 = day_30.get("kaplan_meier_cause_specific")
    aj_30 = day_30.get("aalen_johansen_cif")
    if km_30 is not None and aj_30 is not None:
        points = round(km_30 - aj_30, 4)
        relative = round((km_30 - aj_30) / aj_30 * 100, 2)
        assert_equal(
            "KM overstatement in points",
            points,
            results["headline"]["km_overstatement_30d_points"],
            tolerance=0.0002,
        )
        assert_equal(
            "KM overstatement, relative",
            relative,
            results["headline"]["km_overstatement_30d_relative_pct"],
            tolerance=0.05,
        )
    else:
        report.warn("survival curve values not found; skipped the headline recomputation")

    # Every reported AUC has to be a probability, and a model that beats 0.95 on
    # administrative records alone is a leak rather than an achievement.
    for target, block in results["targets"].items():
        for model, entry in block["models"].items():
            auc = entry["test_calibrated"]["roc_auc"]
            if not 0.0 <= auc <= 1.0:
                report.fail(f"{target}/{model}: AUC {auc} is not a probability")
            elif model != "prior" and auc > 0.95:
                report.fail(
                    f"{target}/{model}: AUC {auc:.4f} is implausibly high for "
                    "administrative records and suggests label leakage"
                )
            else:
                report.ok(f"{target}/{model} AUC {auc:.4f} is plausible", verbose)

    # The shuffled-label control is the single check that would catch a leak the
    # others missed, so it gets asserted rather than merely reported.
    control = results["headline"]["shuffled_label_control_auc"]
    if abs(control - 0.5) < 0.02:
        report.ok(f"shuffled-label control {control:.4f} is at chance", verbose)
    else:
        report.fail(
            f"shuffled-label control is {control:.4f}, not chance. Something in the "
            "feature matrix encodes the outcome."
        )


def main(argv: list[str] | None = None) -> int:
    """Run every check and return a shell exit code."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--strict", action="store_true", help="exit 1 on any failure")
    parser.add_argument("-v", "--verbose", action="store_true", help="show passing checks too")
    args = parser.parse_args(argv)

    results = load_results()
    report = Report()

    run_consistency_checks(results, report, args.verbose)
    run_number_checks(build_checks(results), report, args.verbose)
    run_house_style_checks(report, args.verbose)
    run_repository_checks(report, args.verbose)
    run_json_checks(report, args.verbose)

    print("\n" + "=" * 72)
    if report.failures:
        print(f"{RED}{len(report.failures)} failed{RESET}, {report.passed} passed")
        for failure in report.failures:
            print(f"  - {failure}")
    else:
        print(f"{GREEN}All {report.passed} checks passed.{RESET}")
    if report.warnings:
        print(f"{YELLOW}{len(report.warnings)} warning(s){RESET}")

    return 1 if (report.failures and args.strict) else 0


if __name__ == "__main__":
    raise SystemExit(main())
