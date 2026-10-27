"""Generate a small, synthetic, Austin-shaped dataset for the quickstart demo.

The real Austin Animal Center archive is about 137,000 intake rows and 40 MB,
and the full pipeline takes about 35 minutes. That is the right size for the
paper and the wrong size for someone who wants to see the code run. This script
writes two small CSV files with exactly the same columns, value formats and
timestamp format as the City of Austin Socrata export, so every loader, the
episode builder, the feature code and the models run on them unchanged.

The animals are synthetic. No row describes a real animal, and no number
computed from these files should be quoted as a finding about the shelter. The
generator plants a known, plausible signal (young animals, healthy intakes and
cats are adopted sooner; older animals, sick intakes and bully-type breed labels
wait longer) so a model trained on it has something real to find.

Seeded, so two runs write byte-identical files.

Usage:
    python bin/make_sample_data.py                    # about 3,200 intake rows into data/sample/
    python bin/make_sample_data.py --intakes 1500     # smaller
    python bin/make_sample_data.py --output-dir /tmp/sample
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data" / "sample"
SEED = 20260820

# The archive's export cutoff. Episodes still open at this moment have no
# outcome row, exactly as in the real file.
CUTOFF = pd.Timestamp("2022-03-04 11:25:00")
START = pd.Timestamp("2016-01-01")

# Socrata writes timestamps like "01/03/2019 04:19:00 PM".
TIMESTAMP_FORMAT = "%m/%d/%Y %I:%M:%S %p"

INTAKE_COLUMNS = [
    "Animal ID", "Name", "DateTime", "MonthYear", "Found Location", "Intake Type",
    "Intake Condition", "Animal Type", "Sex upon Intake", "Age upon Intake", "Breed", "Color",
]
OUTCOME_COLUMNS = [
    "Animal ID", "Name", "DateTime", "MonthYear", "Date of Birth", "Outcome Type",
    "Outcome Subtype", "Animal Type", "Sex upon Outcome", "Age upon Outcome", "Breed", "Color",
]

# Breed strings use tokens that exist in data/reference/breed_attributes_llm.psv,
# so the structured breed features are populated the way they are on real data.
# The third value is a multiplier on the expected stay length.
DOG_BREEDS = [
    ("Labrador Retriever Mix", 0.22, 0.95),
    ("Pit Bull Mix", 0.20, 1.80),
    ("Chihuahua Shorthair Mix", 0.14, 0.75),
    ("German Shepherd Mix", 0.10, 1.10),
    ("Australian Cattle Dog Mix", 0.08, 1.00),
    ("Siberian Husky Mix", 0.05, 1.05),
    ("Dachshund Mix", 0.05, 0.70),
    ("Boxer Mix", 0.05, 1.40),
    ("Border Collie Mix", 0.04, 0.90),
    ("Staffordshire Mix", 0.04, 1.70),
    ("Beagle Mix", 0.03, 0.85),
]
CAT_BREEDS = [
    ("Domestic Shorthair Mix", 0.72, 1.00),
    ("Domestic Medium Hair Mix", 0.14, 0.95),
    ("Domestic Longhair Mix", 0.07, 0.90),
    ("Siamese Mix", 0.07, 0.80),
]
OTHER_ANIMALS = [("Bird", "Chicken"), ("Other", "Raccoon"), ("Other", "Bat"), ("Other", "Rabbit Sh")]

DOG_COLORS = ["Black/White", "Brown/White", "Tan", "Black", "Brindle/White", "Tricolor", "White", "Blue/White"]
CAT_COLORS = ["Brown Tabby", "Black", "Orange Tabby", "Black/White", "Calico", "Blue", "White", "Tortie"]
NAMES = [
    "Luna", "Max", "Bella", "Charlie", "Daisy", "Rocky", "Milo", "Lucy", "Cooper", "Nala",
    "Buddy", "Oreo", "Penny", "Bear", "Ginger", "Duke", "Willow", "Zeus", "Rosie", "Simba",
]
LOCATIONS = [
    ("Austin (TX)", 0.45),
    ("{n} Example Street in Austin (TX)", 0.30),
    ("Manor (TX)", 0.06),
    ("Del Valle (TX)", 0.06),
    ("Pflugerville (TX)", 0.05),
    ("Travis (TX)", 0.08),
]


def _choice(rng: np.random.Generator, options: list, weights: list[float]):
    """Draw one option with the given (not necessarily normalised) weights."""
    probabilities = np.asarray(weights, dtype=float)
    return options[rng.choice(len(options), p=probabilities / probabilities.sum())]


def format_age(days: float) -> str:
    """Write an age the way Austin does: "2 years", "3 months", "4 weeks", "5 days"."""
    if days >= 365.25:
        value, unit = int(days // 365.25), "year"
    elif days >= 30.4375:
        value, unit = int(days // 30.4375), "month"
    elif days >= 7:
        value, unit = int(days // 7), "week"
    else:
        value, unit = max(int(days), 0), "day"
    return f"{value} {unit}{'' if value == 1 else 's'}"


def _draw_animal(rng: np.random.Generator) -> dict:
    """Draw one animal's intake-time attributes and its expected-stay multiplier."""
    species = _choice(rng, ["Dog", "Cat", "Other"], [0.55, 0.40, 0.05])
    if species == "Dog":
        breed, _, breed_factor = _choice(rng, DOG_BREEDS, [b[1] for b in DOG_BREEDS])
        color = str(rng.choice(DOG_COLORS))
        # Puppies are common, seniors are rare.
        age_days = float(rng.choice([rng.uniform(21, 180), rng.uniform(180, 2900), rng.uniform(2900, 5000)],
                                    p=[0.25, 0.65, 0.10]))
    elif species == "Cat":
        breed, _, breed_factor = _choice(rng, CAT_BREEDS, [b[1] for b in CAT_BREEDS])
        color = str(rng.choice(CAT_COLORS))
        # Kitten season dominates cat intake.
        age_days = float(rng.choice([rng.uniform(7, 120), rng.uniform(120, 2500), rng.uniform(2500, 5500)],
                                    p=[0.50, 0.42, 0.08]))
    else:
        species, breed = OTHER_ANIMALS[rng.integers(len(OTHER_ANIMALS))]
        breed_factor, color, age_days = 1.0, "Brown", float(rng.uniform(30, 900))

    intake_type = _choice(
        rng,
        ["Stray", "Owner Surrender", "Public Assist", "Abandoned", "Euthanasia Request"],
        [0.66, 0.23, 0.06, 0.04, 0.01],
    )
    if species not in {"Dog", "Cat"}:
        intake_type = "Wildlife" if rng.random() < 0.7 else "Stray"
    condition = _choice(
        rng, ["Normal", "Injured", "Sick", "Nursing", "Aged", "Other"], [0.84, 0.06, 0.05, 0.03, 0.01, 0.01]
    )
    if age_days > 3650 and rng.random() < 0.3:
        condition = "Aged"

    female = rng.random() < 0.5
    sterilised = rng.random() < (0.35 if intake_type == "Owner Surrender" else 0.12)
    if rng.random() < 0.04:
        sex = "Unknown"
    elif female:
        sex = "Spayed Female" if sterilised else "Intact Female"
    else:
        sex = "Neutered Male" if sterilised else "Intact Male"

    if rng.random() < 0.70:
        name = str(rng.choice(NAMES))
        # Austin marks shelter-assigned names with a leading asterisk.
        if intake_type == "Stray" and rng.random() < 0.6:
            name = "*" + name
    else:
        name = ""

    location = _choice(rng, [loc[0] for loc in LOCATIONS], [loc[1] for loc in LOCATIONS])
    location = location.format(n=int(rng.integers(100, 9999)))

    return {
        "species": species,
        "breed": breed,
        "breed_factor": breed_factor,
        "color": color,
        "age_days": age_days,
        "intake_type": intake_type,
        "condition": condition,
        "sex": sex,
        "name": name,
        "location": location,
    }


def _draw_outcome(rng: np.random.Generator, animal: dict) -> tuple[str, str, float]:
    """Draw (outcome type, subtype, stay length in days) from the planted signal."""
    if animal["species"] not in {"Dog", "Cat"}:
        outcome = _choice(rng, ["Transfer", "Euthanasia", "Relocate"], [0.5, 0.3, 0.2])
        return outcome, "", float(rng.uniform(0, 3))
    if animal["intake_type"] == "Euthanasia Request":
        return "Euthanasia", "Suffering", float(rng.uniform(0, 1))

    # Competing exits first: owners reclaim strays, partners take transfers.
    p_return = 0.20 if animal["intake_type"] == "Stray" and animal["age_days"] > 365 else 0.03
    p_transfer = 0.10 + (0.30 if animal["condition"] in {"Sick", "Injured", "Nursing"} else 0.0)
    p_bad = 0.04 if animal["condition"] in {"Sick", "Injured", "Aged"} else 0.005
    draw = rng.random()
    if draw < p_return:
        return "Return to Owner", "", float(rng.exponential(3.0))
    if draw < p_return + p_transfer:
        return "Transfer", "Partner", float(rng.exponential(8.0))
    if draw < p_return + p_transfer + p_bad:
        return _choice(rng, ["Euthanasia", "Died"], [0.6, 0.4]), "Medical", float(rng.exponential(10.0))

    # Adoption. The expected stay is where the planted signal lives.
    median = 13.0 if animal["species"] == "Cat" else 18.0
    if animal["age_days"] < 180:
        median *= 0.40
    elif animal["age_days"] > 2900:
        median *= 2.6
    if animal["condition"] in {"Sick", "Injured", "Aged"}:
        median *= 2.2
    if animal["intake_type"] == "Owner Surrender":
        median *= 0.80
    if animal["sex"].startswith(("Spayed", "Neutered")):
        median *= 0.85
    if "Black" in animal["color"] and "/" not in animal["color"]:
        median *= 1.15
    median *= animal["breed_factor"]
    stay = float(rng.lognormal(np.log(median), 0.75))
    return _choice(rng, ["Adoption", "Rto-Adopt"], [0.97, 0.03]), "", stay


def generate(n_intakes: int, seed: int = SEED) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (intakes, outcomes) frames in the Austin Socrata CSV layout.

    Args:
        n_intakes: approximate number of intake rows; repeat visits add a few.
        seed: random seed, so the output is reproducible.
    """
    rng = np.random.default_rng(seed)
    span_seconds = (CUTOFF - START).total_seconds()
    intakes: list[dict] = []
    outcomes: list[dict] = []

    for index in range(n_intakes):
        animal_id = f"A{700000 + index:06d}"
        animal = _draw_animal(rng)
        arrival = START + pd.Timedelta(float(rng.uniform(0, span_seconds)), unit="s")
        # About one animal in twelve comes back, which is what makes the episode
        # pairing in secondchance.episodes non-trivial.
        visits = 2 if rng.random() < 0.08 else 1

        for _ in range(visits):
            arrival = arrival.floor("min")
            if arrival >= CUTOFF:
                break
            outcome, subtype, stay = _draw_outcome(rng, animal)
            departure = (arrival + pd.Timedelta(stay, unit="D")).floor("min")

            intakes.append(
                {
                    "Animal ID": animal_id,
                    "Name": animal["name"],
                    "DateTime": arrival.strftime(TIMESTAMP_FORMAT),
                    "MonthYear": arrival.strftime("%b %Y"),
                    "Found Location": animal["location"],
                    "Intake Type": animal["intake_type"],
                    "Intake Condition": animal["condition"],
                    "Animal Type": animal["species"],
                    "Sex upon Intake": animal["sex"],
                    "Age upon Intake": format_age(animal["age_days"]),
                    "Breed": animal["breed"],
                    "Color": animal["color"],
                }
            )

            # Still in the building at the cutoff, or (rarely) a lost outcome
            # form: no outcome row, exactly like the real export.
            if departure >= CUTOFF or rng.random() < 0.003:
                break

            sex_out = animal["sex"]
            if outcome in {"Adoption", "Rto-Adopt", "Transfer"}:
                sex_out = sex_out.replace("Intact Male", "Neutered Male").replace("Intact Female", "Spayed Female")
            outcome_age = animal["age_days"] + stay
            outcomes.append(
                {
                    "Animal ID": animal_id,
                    "Name": animal["name"],
                    "DateTime": departure.strftime(TIMESTAMP_FORMAT),
                    "MonthYear": departure.strftime("%b %Y"),
                    "Date of Birth": (arrival - pd.Timedelta(animal["age_days"], unit="D")).strftime("%m/%d/%Y"),
                    "Outcome Type": outcome,
                    "Outcome Subtype": subtype,
                    "Animal Type": animal["species"],
                    "Sex upon Outcome": sex_out,
                    "Age upon Outcome": format_age(outcome_age),
                    "Breed": animal["breed"],
                    "Color": animal["color"],
                }
            )

            # A repeat visit happens some months after the animal left.
            animal["age_days"] = outcome_age + float(rng.uniform(60, 500))
            arrival = departure + pd.Timedelta(float(rng.uniform(60, 500)), unit="D")

    intake_frame = pd.DataFrame(intakes, columns=INTAKE_COLUMNS)
    outcome_frame = pd.DataFrame(outcomes, columns=OUTCOME_COLUMNS)
    return intake_frame, outcome_frame


def main(argv: list[str] | None = None) -> int:
    """Write the sample CSVs and print where they went."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--intakes", type=int, default=3000, help="number of animals to generate")
    parser.add_argument("--seed", type=int, default=SEED, help="random seed")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT, help="where to write the CSVs")
    args = parser.parse_args(argv)

    intakes, outcomes = generate(args.intakes, args.seed)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    intake_path = args.output_dir / "aac_intakes_sample.csv"
    outcome_path = args.output_dir / "aac_outcomes_sample.csv"
    intakes.to_csv(intake_path, index=False)
    outcomes.to_csv(outcome_path, index=False)

    print(f"Wrote {len(intakes):,} intake rows  -> {intake_path}")
    print(f"Wrote {len(outcomes):,} outcome rows -> {outcome_path}")
    print("These animals are synthetic. Use the files to run the code, not to quote findings.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
