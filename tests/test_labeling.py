"""Tests for the structured breed labels.

Two things are being checked here and they are different in kind. The first is
that the parsing and composition rules do what the paper says they do, which is
ordinary correctness. The second is that the reference table shipped in the
repository is complete and internally consistent, which is a claim the paper
makes out loud ("resolves 100 percent of dog and cat breed strings") and which
would otherwise rot silently the first time somebody edits the file.

Nothing here calls Bedrock. The reference is a versioned artefact, checked in,
and a test that needed network access would be a test nobody runs.
"""

from __future__ import annotations

import pytest

from secondchance.labeling.breed_llm import (
    COAT_ORDINAL,
    ENERGY_ORDINAL,
    FLAG_ORDER,
    GROOMING_ORDINAL,
    GROUP_NAMES,
    SIZE_ORDINAL,
    build_prompt,
    load_reference,
    split_breed_string,
    structure_breed,
)
from secondchance.labeling.rule_baseline import structure_breed_rules


@pytest.fixture(scope="module")
def reference():
    """The checked-in reference table, loaded once for the module."""
    return load_reference()


# --- splitting Austin's convention -------------------------------------------

@pytest.mark.parametrize(
    ("raw", "tokens", "is_mix"),
    [
        ("Labrador Retriever Mix", ["Labrador Retriever"], True),
        ("Labrador Retriever", ["Labrador Retriever"], False),
        ("Labrador Retriever/Pit Bull", ["Labrador Retriever", "Pit Bull"], True),
        ("Labrador Retriever/Pit Bull Mix", ["Labrador Retriever", "Pit Bull"], True),
        ("Domestic Shorthair Mix", ["Domestic Shorthair"], True),
        ("", [], False),
        (None, [], False),
    ],
)
def test_split_breed_string_follows_austins_convention(raw, tokens, is_mix):
    """A slash already means a cross, with or without the word "Mix"."""
    assert split_breed_string(raw) == (tokens, is_mix)


# --- composition rules --------------------------------------------------------

def test_size_takes_the_upper_bound_of_a_cross(reference):
    """A Labrador crossed with a Chihuahua is not a Chihuahua sized dog.

    Adopters shop by the largest thing the animal might turn into, and the
    housing constraints that actually stop an adoption are upper bounds too.
    """
    lab = structure_breed("Labrador Retriever", reference)
    chihuahua = structure_breed("Chihuahua Shorthair", reference)
    cross = structure_breed("Labrador Retriever/Chihuahua Shorthair", reference)

    assert chihuahua["breed_size_ordinal"] < lab["breed_size_ordinal"]
    assert cross["breed_size_ordinal"] == lab["breed_size_ordinal"]
    assert cross["breed_weight_lb"] == lab["breed_weight_lb"]


def test_risk_flags_are_an_or_not_an_average(reference):
    """A cross that reads as part bully breed meets the same housing barriers."""
    cross = structure_breed("Pit Bull/Labrador Retriever", reference)
    assert cross["breed_bully_type"] == 1
    assert cross["breed_bsl_risk"] == 1


def test_purebred_requires_a_single_recognised_unmixed_token(reference):
    assert structure_breed("Labrador Retriever", reference)["breed_purebred"] == 1
    assert structure_breed("Labrador Retriever Mix", reference)["breed_purebred"] == 0
    assert structure_breed("Labrador Retriever/Pit Bull", reference)["breed_purebred"] == 0
    # Austin's cat catch-all is a coat description, not a recognised breed.
    assert structure_breed("Domestic Shorthair", reference)["breed_purebred"] == 0


def test_an_unknown_breed_degrades_to_missing_rather_than_to_zero(reference):
    """An unresolvable string must not look like a toy, hairless, calm dog."""
    result = structure_breed("Nonexistent Sighthound Of Nowhere", reference)
    assert result["breed_resolved"] == 0
    assert result["breed_primary_group"] == "Unknown"
    for column in ["breed_size_ordinal", "breed_weight_lb", "breed_coat_ordinal"]:
        assert result[column] != result[column], f"{column} should be NaN, not a default"


def test_partially_resolved_cross_is_marked_unresolved(reference):
    """Half a match is still a caveat the model should be able to see."""
    result = structure_breed("Labrador Retriever/Nonexistent Breed", reference)
    assert result["breed_tokens"] == 2
    assert result["breed_resolved"] == 0
    # But the half we do know is still used rather than thrown away.
    assert result["breed_size_ordinal"] > 0


# --- the shipped reference table ---------------------------------------------

def test_reference_covers_the_common_austin_strings(reference):
    """The strings that dominate the corpus must all resolve.

    These twelve account for the majority of episodes in the data. If an edit to
    the reference breaks one of them, the drop in coverage would be large enough
    to move the results, so it should break a test rather than a model.
    """
    common = [
        "Domestic Shorthair Mix",
        "Domestic Medium Hair Mix",
        "Domestic Longhair Mix",
        "Pit Bull Mix",
        "Labrador Retriever Mix",
        "Chihuahua Shorthair Mix",
        "German Shepherd Mix",
        "Australian Cattle Dog Mix",
        "Dachshund Mix",
        "Boxer Mix",
        "Border Collie Mix",
        "Siamese Mix",
    ]
    for raw in common:
        assert structure_breed(raw, reference)["breed_resolved"] == 1, raw


def test_every_reference_row_uses_a_declared_code(reference):
    """A typo in the table would otherwise become a silent NaN in the features."""
    assert len(reference) >= 200
    for name, record in reference.items():
        assert record.group in GROUP_NAMES, f"{name} has group {record.group!r}"
        assert record.size in SIZE_ORDINAL, f"{name} has size {record.size!r}"
        assert record.coat in COAT_ORDINAL, f"{name} has coat {record.coat!r}"
        assert record.grooming in GROOMING_ORDINAL, f"{name} grooming {record.grooming!r}"
        assert record.energy in ENERGY_ORDINAL, f"{name} energy {record.energy!r}"
        assert 1 <= record.weight_lb <= 200, f"{name} weighs {record.weight_lb}"


def test_reference_flags_are_boolean_and_complete(reference):
    for name, record in reference.items():
        for flag in FLAG_ORDER:
            value = getattr(record, flag)
            assert value in (0, 1), f"{name}.{flag} is {value!r}"


def test_reference_has_no_duplicate_tokens():
    """Two rows for one token would mean the later one silently wins."""
    from secondchance.labeling.breed_llm import DEFAULT_REFERENCE

    names = [
        line.split("|", 1)[0].strip()
        for line in DEFAULT_REFERENCE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    duplicates = {n for n in names if names.count(n) > 1}
    assert not duplicates, f"duplicate reference tokens: {sorted(duplicates)}"


def test_known_bully_breeds_carry_the_flag(reference):
    """The flag drives a fairness finding in the paper, so it is pinned here."""
    for token in ["Pit Bull", "American Pit Bull Terrier", "American Staffordshire Terrier",
                  "Staffordshire", "American Bulldog"]:
        assert reference[token].bully_type == 1, token
    for token in ["Labrador Retriever", "Beagle", "Siamese"]:
        assert reference[token].bully_type == 0, token


# --- the prompt ---------------------------------------------------------------

def test_prompt_is_deterministic_and_carries_every_token():
    """The prompt is a versioned artefact; a silent edit invalidates the labels."""
    tokens = ["Labrador Retriever", "Pit Bull"]
    first = build_prompt(tokens)
    assert build_prompt(tokens) == first
    for token in tokens:
        assert token in first
    assert "JSON" in first, "the prompt must pin the output format"
    assert "temperature" not in first.lower(), "sampling config belongs in the call, not the prompt"


# --- the keyword baseline -----------------------------------------------------

def test_rule_baseline_returns_the_same_schema_as_the_llm_path(reference):
    """The ablation compares two label sources, so the columns have to match.

    If the baseline quietly returned a different set of keys, the comparison in
    the paper would be between two different feature spaces rather than between
    two ways of filling one.
    """
    llm = structure_breed("Labrador Retriever/Pit Bull Mix", reference)
    rules = structure_breed_rules("Labrador Retriever/Pit Bull Mix")
    assert set(rules) == set(llm)


def test_rule_baseline_catches_the_obvious_cases():
    """It is a real baseline, not a straw man, and the paper says so."""
    assert structure_breed_rules("Pit Bull Mix")["breed_bully_type"] == 1
    assert structure_breed_rules("Great Dane")["breed_size_ordinal"] >= 3
    assert structure_breed_rules("Chihuahua Shorthair")["breed_size_ordinal"] <= 1
    assert structure_breed_rules("Labrador Retriever Mix")["breed_bully_type"] == 0


# --- the published-standards audit -------------------------------------------
#
# Twenty-five tokens checked by hand against kennel club and breed registry
# standards, with the published typical adult weight range and size class beside
# each one. This is the audit reported in docs/06_LLM_EVALUATION.md, kept here so
# that an edit to the reference that breaks it breaks a build rather than quietly
# making the documented agreement rate wrong.
#
# Ranges are the published typical adult weights, taken generously: the point is
# to catch a reference that says a Great Dane weighs 40 pounds, not to litigate
# whether a particular Beagle is 24 or 26.

AUDIT_SAMPLE = [
    # (token, published weight range in lb, published size class)
    ("Labrador Retriever", (55, 80), "large"),
    ("German Shepherd", (50, 90), "large"),
    ("Chihuahua Shorthair", (3, 6), "toy"),
    ("Great Dane", (110, 175), "giant"),
    ("Beagle", (20, 30), "small"),
    ("Siberian Husky", (35, 60), "medium"),
    ("Dachshund", (16, 32), "small"),
    ("Rottweiler", (80, 135), "large"),
    ("Yorkshire Terrier", (4, 7), "toy"),
    ("Boxer", (50, 80), "large"),
    ("Border Collie", (30, 55), "medium"),
    ("Australian Cattle Dog", (35, 50), "medium"),
    ("Pit Bull", (30, 65), "medium"),
    ("Standard Poodle", (40, 70), "large"),
    ("Shih Tzu", (9, 16), "toy"),
    ("Miniature Schnauzer", (11, 20), "small"),
    ("St. Bernard Rough Coat", (120, 180), "giant"),
    ("Pug", (14, 18), "toy"),
    ("Bloodhound", (80, 110), "large"),
    ("Basset Hound", (40, 65), "medium"),
    ("Siamese", (8, 12), "small"),
    ("Domestic Shorthair", (8, 12), "small"),
    ("Maine Coon", (10, 25), "medium"),
    ("Persian", (7, 12), "small"),
    ("Australian Shepherd", (40, 65), "medium"),
]

SIZE_NAMES_BY_CODE = {"T": "toy", "S": "small", "M": "medium", "L": "large", "G": "giant"}

# The three size-class disagreements found by the audit, recorded rather than
# excluded. All three are boundary calls on an ordinal scale where the underlying
# weight is right, and docs/06_LLM_EVALUATION.md discusses each one. Listing them
# here means a *new* disagreement still fails.
KNOWN_SIZE_DISAGREEMENTS = {"Shih Tzu", "Pug", "Maine Coon"}


@pytest.mark.parametrize(("token", "weight_range", "size_class"), AUDIT_SAMPLE)
def test_reference_weight_is_inside_the_published_range(reference, token, weight_range, size_class):
    """Weight is the continuous attribute the model actually uses, so it has to be right."""
    del size_class
    record = reference[token]
    low, high = weight_range
    assert low <= record.weight_lb <= high, (
        f"{token} is listed at {record.weight_lb} lb, outside the published {low} to {high}"
    )


@pytest.mark.parametrize(("token", "weight_range", "size_class"), AUDIT_SAMPLE)
def test_reference_size_class_matches_the_published_one(reference, token, weight_range, size_class):
    """Ordinal size class, with three documented boundary disagreements allowed."""
    del weight_range
    actual = SIZE_NAMES_BY_CODE[reference[token].size]
    if token in KNOWN_SIZE_DISAGREEMENTS:
        pytest.xfail(f"{token}: {actual} against a published {size_class}, a documented boundary call")
    assert actual == size_class, f"{token} is {actual}, published as {size_class}"


def test_the_audit_agreement_rate_is_what_the_documentation_claims(reference):
    """docs/06_LLM_EVALUATION.md reports 25/25 on weight and 22/25 on size class.

    Asserting the rate itself, rather than only the individual rows, means the
    documented figure cannot drift away from the audit that produced it.
    """
    weight_agreements = 0
    size_agreements = 0
    for token, (low, high), size_class in AUDIT_SAMPLE:
        record = reference[token]
        weight_agreements += low <= record.weight_lb <= high
        size_agreements += SIZE_NAMES_BY_CODE[record.size] == size_class

    assert weight_agreements == 25, f"weight agreement is {weight_agreements}/25, documented as 25/25"
    assert size_agreements == 22, f"size agreement is {size_agreements}/25, documented as 22/25"
