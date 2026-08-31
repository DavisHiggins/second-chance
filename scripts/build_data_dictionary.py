#!/usr/bin/env python3
"""Generate docs/04_DATA_DICTIONARY.md from the actual feature matrix.

A data dictionary maintained by hand is a data dictionary that is wrong within a
month. The prose for each column lives here, next to the code, and the numbers
beside it (missingness, range, level counts) are read off the built matrix every
time this runs. If a column is added to ``features.py`` and not described here,
this script says so and exits non-zero rather than writing a dictionary with a
hole in it.

Usage:
    python3 scripts/build_data_dictionary.py
    python3 scripts/build_data_dictionary.py --check   # verify without rewriting
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from secondchance.features import (  # noqa: E402
    ALL_FEATURES,
    CATEGORICAL_FEATURES,
    DEPLOYMENT_FEATURES,
    FEATURE_BLOCKS,
    MONOTONE_TIME_FEATURES,
)

FEATURES_PATH = ROOT / "data" / "interim" / "features.parquet"
OUTPUT_PATH = ROOT / "docs" / "04_DATA_DICTIONARY.md"

BLOCK_INTRO = {
    "animal": (
        "What the animal is, as recorded at the desk. Every column here is written "
        "down before anyone knows what happens next, which is what makes them safe "
        "to use. Note that Austin's export also carries *Sex upon Outcome* and *Age "
        "upon Outcome*, and neither appears anywhere in this project: both are "
        "recorded after the thing being predicted has already happened."
    ),
    "intake_context": (
        "How and when the animal arrived. The calendar columns are here rather than "
        "in their own block because they describe the arrival rather than the "
        "animal, and because the ablation study treats arrival circumstances as one "
        "unit. Day of year is encoded as a sine and cosine pair so that the model "
        "sees late December and early January as neighbours rather than as opposite "
        "ends of a number line."
    ),
    "shelter_load": (
        "How full the building was. These are the only columns computed by looking "
        "at other animals, so they are also the only ones where a leak could hide. "
        "Each one counts events strictly before the arrival being described: the "
        "census excludes the arriving animal itself, and the rolling volumes are "
        "shifted by a day so that same-day arrivals cannot contribute to their own "
        "feature."
    ),
    "breed_llm": (
        "Breed, turned into structure. Austin records breed as free text with 2,736 "
        "distinct values, but the strings are compositional, so splitting on "
        "Austin's own convention collapses them to 254 atomic tokens that a language "
        "model describes once, offline. See docs/06_LLM_EVALUATION.md for how the "
        "labels were produced and what they were checked against."
    ),
    "weather": (
        "Daily Austin observations joined on the arrival date. Measured, reported, "
        "and found not to help either target (30 day +0.0005, p = 0.710; long stay "
        "+0.0017, p = 0.514). Retained in the feature list because a null result "
        "that is deleted from the code becomes a null result nobody can check."
    ),
}

DESCRIPTIONS: dict[str, str] = {
    # --- animal ---------------------------------------------------------------
    "age_at_intake_days": "Age in days, parsed from Austin's free text (\"2 years\", \"11 months\"). Negative and unreadable values become missing rather than zero, because zero would be a newborn.",
    "age_at_intake_log": "log(1 + age in days). Kept alongside the raw age because adoption probability changes far faster across the first six months than across the years after.",
    "age_band": "Life stage, cut at 60 days, 180 days, 1 year, 3 years and 8 years. Bands chosen to match how shelter staff actually talk about animals rather than to equalise counts.",
    "animal_type": "Species as recorded at intake. The modelling cohort keeps Dog and Cat only.",
    "sex_upon_intake": "Sex and sterilisation status on arrival, verbatim from the export.",
    "is_sterilized_at_intake": "1 if the intake record says neutered or spayed. Arriving already sterilised is a strong signal that the animal had an owner.",
    "is_female": "1 if the intake sex string contains \"Female\".",
    "sex_unknown": "1 when sex was not recorded, kept as its own indicator rather than folded into the imputer.",
    "has_name": "1 if the animal arrived with any name at all.",
    "name_is_shelter_assigned": "1 if the name begins with an asterisk, Austin's convention for a name staff gave the animal. One of the strongest single features in the long-stay model, and the paper argues it is a proxy for arriving with nobody looking for you rather than anything about the animal.",
    "name_length": "Letters in the name, with the asterisk stripped first.",
    "color_token_count": "How many colours the coat description lists, from Austin's slash-separated convention.",
    "color_has_black": "1 if the colour string mentions black. Included specifically so the \"black dog syndrome\" claim in the literature can be tested rather than assumed.",
    "color_has_white": "1 if the colour string mentions white.",
    "color_has_brown": "1 if the colour string mentions brown, chocolate or liver.",
    "color_is_tabby": "1 for tabby patterning, which is almost entirely a cat feature.",
    "color_is_brindle": "1 for brindle patterning.",
    "color_is_tricolor": "1 for tricolour or calico.",
    # --- intake context -------------------------------------------------------
    "intake_type": "How the animal came in: Stray, Owner Surrender, Public Assist, Wildlife, Euthanasia Request, Abandoned. The single most informative non-age feature.",
    "intake_condition": "Condition assessed on arrival: Normal, Injured, Sick, Nursing, Aged, Pregnant and nine rarer codes.",
    "location_has_street_address": "1 if the found location looks like a street address rather than a county or a region. A proxy for whether the animal was found inside the city's service area.",
    "location_outside_austin_city": "1 if the location names a surrounding county or a town outside Austin.",
    "prior_intake_count": "How many times this animal has been through before. Computed from the reconstructed episode sequence, so it counts only arrivals that happened earlier in time.",
    "is_repeat_visitor": "1 if prior_intake_count is above zero.",
    "intake_hour": "Hour of arrival, 0 to 23.",
    "intake_month": "Calendar month, 1 to 12.",
    "intake_dayofweek": "Monday is 0.",
    "intake_doy_sin": "sin(2 pi * day of year / 365.25). Half of the circular encoding of the calendar.",
    "intake_doy_cos": "cos(2 pi * day of year / 365.25). The other half.",
    "season": "Texas seasons rather than calendar ones: kitten season is the real driver here, not the equinox.",
    "is_weekend_intake": "1 for Saturday and Sunday.",
    "is_after_hours_intake": "1 for arrivals before 08:00 or after 18:00.",
    # --- shelter load ---------------------------------------------------------
    "shelter_census_at_intake": "How many other animals were in the building at the moment this one arrived. Computed by a linear sweep over arrival and departure events, minus one so the arriving animal does not count itself. Departures sort before arrivals at an identical timestamp, so an animal replacing one that left the same minute is not double counted.",
    "species_census_at_intake": "The same count, restricted to this animal's species. Four hundred cats is a very different operational situation from four hundred dogs.",
    "intakes_prior_7d": "Arrivals in the seven days before this one, shifted so the current day is excluded.",
    "intakes_prior_30d": "Arrivals in the thirty days before this one, same exclusion.",
    "adoptions_prior_30d": "Adoptions completed in the thirty days before this arrival. A count of other animals' past outcomes, which is knowable at the desk and is not this animal's outcome.",
    # --- breed ----------------------------------------------------------------
    "breed_tokens": "How many atomic breeds the string names, after splitting on slashes and stripping the \"Mix\" suffix.",
    "breed_resolved": "1 when every named token was found in the structured reference. Partial matches are still used, and still flagged here as unresolved.",
    "breed_is_mix": "1 when the string carries the \"Mix\" suffix or lists more than one breed. In Austin's convention a slash already means a cross.",
    "breed_size_ordinal": "Largest size across the named breeds, 0 (toy) to 4 (giant). The maximum rather than an average, because a Labrador crossed with a Chihuahua is not a Chihuahua sized dog and adopters shop by the upper bound.",
    "breed_weight_lb": "Largest typical adult weight across the named breeds.",
    "breed_coat_ordinal": "Longest coat across the named breeds, 0 (hairless) to 3 (long).",
    "breed_grooming_ordinal": "Highest grooming burden across the named breeds, 0 to 2.",
    "breed_energy_ordinal": "Highest energy level across the named breeds, 0 to 3.",
    "breed_bully_type": "1 if any named breed reads as bully type. A logical OR, because a cross that reads as part bully breed meets the same housing barriers as a full one. This is a label about a label: Olson and colleagues measured 50 percent sensitivity for staff identification of pit bull type dogs against DNA.",
    "breed_brachycephalic": "1 if any named breed is flat faced.",
    "breed_guardian": "1 for guardian and working breeds.",
    "breed_bsl_risk": "1 if any named breed is commonly named in breed-specific legislation or by insurers. Broader than breed_bully_type and included because the housing barrier is what actually affects the wait.",
    "breed_purebred": "1 only for a single, recognised, unmixed token. A logical AND, unlike the risk flags.",
    "breed_primary_group": "Kennel club group of the first named breed, or \"Domestic cat\" for Austin's cat catch-alls.",
    # --- weather --------------------------------------------------------------
    "weather_tmax_f": "Daily maximum temperature on the arrival date, Fahrenheit.",
    "weather_tmin_f": "Daily minimum temperature, Fahrenheit.",
    "weather_prcp_in": "Precipitation on the arrival date, inches.",
    "weather_tmax_7d_mean": "Mean daily maximum across the trailing seven days.",
    "weather_prcp_7d_total": "Total precipitation across the trailing seven days.",
    # --- excluded -------------------------------------------------------------
    "intake_year": "Calendar year of arrival. Built, measured, and deliberately excluded from the deployed model.",
    "days_since_series_start": "Days since the first arrival in the series. Excluded for the same reason.",
}


def describe(series: pd.Series, name: str) -> tuple[str, str, str]:
    """Return (type, missingness, range or levels) for one column."""
    missing = f"{series.isna().mean() * 100:.2f}%"
    if name in CATEGORICAL_FEATURES:
        top = ", ".join(str(v) for v in series.value_counts().index[:3])
        return "categorical", missing, f"{series.nunique()} levels ({top}, ...)"
    if set(series.dropna().unique()) <= {0, 1}:
        return "binary", missing, f"{series.mean() * 100:.1f}% are 1"
    return (
        "numeric",
        missing,
        f"{series.min():.2f} to {series.max():.2f}, mean {series.mean():.2f}",
    )


def build(features: pd.DataFrame) -> str:
    """Render the whole document."""
    undocumented = [c for c in ALL_FEATURES if c not in DESCRIPTIONS]
    if undocumented:
        raise SystemExit(
            f"These features have no description in {Path(__file__).name}: {undocumented}\n"
            "Add one there rather than letting the dictionary ship with a hole in it."
        )

    lines = [
        "<!-- Generated by scripts/build_data_dictionary.py. Do not edit by hand: -->",
        "<!-- the prose lives in that script and the numbers are read off the built -->",
        "<!-- feature matrix, so a hand edit here is lost on the next build. -->",
        "",
        "# Data dictionary",
        "",
        f"{len(ALL_FEATURES)} features over {len(features):,} shelter episodes, of which "
        f"{len(DEPLOYMENT_FEATURES)} are used by the deployed model.",
        "",
        "Every column below is knowable at the moment an animal is standing at the "
        "intake desk. That is not a convention, it is the constraint the whole project "
        "is built around, and `tests/test_features.py` enforces it directly by building "
        "the same animal twice with different outcomes and asserting that no deployed "
        "feature moves.",
        "",
        "Missingness and ranges are measured on the full episode table, before the "
        "modelling cohort is applied.",
        "",
        "---",
        "",
    ]

    for block, columns in FEATURE_BLOCKS.items():
        title = block.replace("_", " ").title()
        lines += [f"## {title}", "", BLOCK_INTRO[block], "", ]
        lines += ["| Feature | Type | Missing | Range | Description |", "|---|---|---|---|---|"]
        for column in columns:
            kind, missing, extent = describe(features[column], column)
            lines.append(
                f"| `{column}` | {kind} | {missing} | {extent} | {DESCRIPTIONS[column]} |"
            )
        lines += ["", ]

    lines += [
        "---",
        "",
        "## Built, measured, and excluded",
        "",
        "These two are constructed by `build_features` so the experiment in "
        "`analysis/09_time_features.py` can measure them, and are then excluded from "
        "the deployed feature set because that experiment says they hurt.",
        "",
        "A boosted tree can only split a feature where it has seen values. Once the "
        "model is deployed, every future animal has an `intake_year` beyond the "
        "training maximum, lands in the terminal bin, and the feature stops "
        "discriminating between animals at all. What it does instead is freeze "
        "whatever trend the model learned and keep applying it. Measured on the 2020 "
        "to 2021 test block, including them cost 0.0055 AUC on the 30 day target with "
        "a paired bootstrap p below 0.001. They also make the population stability "
        "index unbounded against any earlier reference window, so a drift detector "
        "watching them fires in every period whether or not anything real has changed.",
        "",
        "| Feature | Type | Missing | Range | Description |",
        "|---|---|---|---|---|",
    ]
    for column in MONOTONE_TIME_FEATURES:
        kind, missing, extent = describe(features[column], column)
        lines.append(f"| `{column}` | {kind} | {missing} | {extent} | {DESCRIPTIONS[column]} |")

    lines += [
        "",
        "---",
        "",
        "## Targets",
        "",
        "Four binary labels, each of which can be missing. Missing means the answer is "
        "not observable yet, not that the answer is no, and the training code drops "
        "those rows for that target rather than treating them as negatives.",
        "",
        "An animal transferred to a rescue partner on day five answers \"no\" to "
        "\"adopted within seven days\": the adoption did not happen, and that is an "
        "observed negative. An animal still in the shelter on day three when the export "
        "was cut has no answer at all. Conflating the two is the classic way to make a "
        "shelter model look better than it is.",
        "",
        "| Target | Definition | Positive rate (test block) |",
        "|---|---|---|",
        "| `adopted_within_7d` | Adopted from the shelter within 7 days of arriving | 16.62% |",
        "| `adopted_within_14d` | Same, within 14 days | 27.64% |",
        "| `adopted_within_30d` | Same, within 30 days | 37.23% |",
        "| `long_stay_60d` | Still in the shelter on day 60 | 11.56% |",
        "",
        "## Survival columns",
        "",
        "Used by the competing-risk analysis rather than by the classifiers.",
        "",
        "| Column | Description |",
        "|---|---|",
        "| `length_of_stay_days` | Days from arrival to exit, or to the export cutoff for an episode that never closed |",
        "| `event_code` | 0 censored, 1 adopted, 2 exited by any other route. Keeping the three states apart is the entire reason the competing-risk estimates in the paper are defensible |",
        "| `is_adopted` | 1 for Adoption or Rto-Adopt, Austin's code for an animal on the return-to-owner track that the finder adopted instead |",
        "| `is_open_at_cutoff` | 1 when no outcome row was ever matched |",
        "| `suspected_missing_outcome` | 1 when an open episode is older than the 99.5th percentile of observed stays (289 days). An intake in 2015 with no outcome by 2022 is an unfiled form, not a seven year resident |",
        "| `effective_exit_datetime` | Exit time used by the occupancy sweep. For a flagged episode this is the arrival plus the threshold, so that a few hundred lost forms do not accumulate into a phantom occupancy of several hundred animals |",
        "",
        "---",
        "",
        "## What is deliberately absent",
        "",
        "**`Sex upon Outcome` and `Age upon Outcome`.** Both are in Austin's raw export "
        "and both would lift the AUC substantially, because they are recorded after the "
        "thing being predicted has already happened. `tests/test_features.py` asserts "
        "that no column whose name contains \"outcome\" reaches the feature list.",
        "",
        "**Anything behavioural.** Protopopova and colleagues showed that in-kennel "
        "behaviour predicts length of stay better than anything in an administrative "
        "record, and none of it exists in any public export. This is the largest single "
        "limitation of the project and it is stated in the paper rather than worked "
        "around.",
        "",
        "**Photographs.** The listing photograph is plausibly the strongest available "
        "predictor and Austin does not publish it.",
        "",
        "---",
        "",
        "## Sources",
        "",
        "| Feed | Source | Identifier |",
        "|---|---|---|",
        "| Intakes | City of Austin Open Data Portal | `wter-evkm` |",
        "| Outcomes | City of Austin Open Data Portal | `9t4d-g238` |",
        "| Weather | National Weather Service observations API | station KATT |",
        "| Regional listings | RescueGroups.org Adoptable Pet Data API | v5 public |",
        "| Breed attributes | Generated, see docs/06_LLM_EVALUATION.md | `data/reference/breed_attributes_llm.psv` |",
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    """Write or check the dictionary."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true", help="verify without rewriting")
    args = parser.parse_args(argv)

    if not FEATURES_PATH.exists():
        print(f"No feature matrix at {FEATURES_PATH}. Run `make features` first.", file=sys.stderr)
        return 2

    document = build(pd.read_parquet(FEATURES_PATH))

    if args.check:
        current = OUTPUT_PATH.read_text(encoding="utf-8") if OUTPUT_PATH.exists() else ""
        if current != document:
            print("Data dictionary is out of date. Run scripts/build_data_dictionary.py")
            return 1
        print("Data dictionary is current.")
        return 0

    OUTPUT_PATH.write_text(document, encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)} ({len(ALL_FEATURES)} features documented)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
