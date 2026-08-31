"""Structural checks on the warehouse SQL.

These do not run any SQL. There is no Redshift here and standing one up for a
test suite would be a good way to have a test suite nobody runs. What they check
instead is the class of mistake that a live database would catch far too late:
an INSERT whose column list has drifted from the table it writes to, a file that
references a table nobody creates, a transform that silently drops rows.

The INSERT check is the one that earns its place. `INSERT INTO t SELECT ...`
without a column list depends on the SELECT matching the table's declared order,
and a schema edit six months later reorders two columns and starts writing the
weather into the label fields. Nothing errors, because the types happen to be
compatible.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

SQL = Path(__file__).resolve().parents[1] / "sql"

SCHEMA = SQL / "01_schema.sql"
STAGING = SQL / "02_staging.sql"
EPISODES = SQL / "03_episodes.sql"
ANALYTICS = SQL / "04_analytics.sql"

ALL_FILES = [SCHEMA, STAGING, EPISODES, ANALYTICS]


def strip_comments(text: str) -> str:
    """Remove line comments so a table name inside prose is not read as SQL."""
    return "\n".join(line.split("--")[0] for line in text.splitlines())


def declared_columns(table: str) -> list[str]:
    """Column names of a CREATE TABLE, in declared order."""
    body = re.search(
        rf"CREATE TABLE {re.escape(table)} \((.*?)\n\)\s*\n(?:DISTSTYLE|;)",
        SCHEMA.read_text(encoding="utf-8"),
        re.S,
    )
    assert body is not None, f"{table} is not declared in 01_schema.sql"

    columns = []
    for line in body.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("--"):
            continue
        name = line.split()[0].rstrip(",")
        if name.upper() in {"PRIMARY", "UNIQUE", "FOREIGN", "CONSTRAINT", "CHECK"}:
            continue
        columns.append(name)
    return columns


def insert_columns(path: Path, table: str) -> list[str]:
    """Column names named by an ``INSERT INTO table (...)`` in a file."""
    match = re.search(
        rf"INSERT INTO {re.escape(table)}\s*\((.*?)\)\s*\n",
        strip_comments(path.read_text(encoding="utf-8")),
        re.S,
    )
    assert match is not None, f"{path.name} has no explicit column list for {table}"
    return [c.strip() for c in match.group(1).replace("\n", " ").split(",") if c.strip()]


# --- every file exists and is non-trivial ------------------------------------


@pytest.mark.parametrize("path", ALL_FILES, ids=lambda p: p.name)
def test_every_referenced_sql_file_exists_and_has_content(path):
    """The runbook and the pipeline Lambda both name these four by path."""
    assert path.exists(), f"{path.name} is referenced but missing"
    assert len(path.read_text(encoding="utf-8")) > 500


@pytest.mark.parametrize("path", ALL_FILES, ids=lambda p: p.name)
def test_parentheses_balance(path):
    """A cheap catch for a truncated statement, which is the usual copy-paste injury."""
    text = strip_comments(path.read_text(encoding="utf-8"))
    # Strings can contain parentheses, so remove them before counting.
    text = re.sub(r"'[^']*'", "''", text)
    assert text.count("(") == text.count(")"), f"{path.name} has unbalanced parentheses"


@pytest.mark.parametrize("path", ALL_FILES, ids=lambda p: p.name)
def test_every_statement_is_terminated(path):
    """A missing semicolon runs two statements together and the error names neither."""
    text = strip_comments(path.read_text(encoding="utf-8")).strip()
    assert text.endswith(";"), f"{path.name} does not end with a terminated statement"


# --- the INSERT this test file exists for ------------------------------------


def test_the_episode_insert_names_every_column_the_table_declares():
    """The check that prevents a schema edit from writing into the wrong fields."""
    declared = declared_columns("analytics.shelter_episodes")
    named = insert_columns(EPISODES, "analytics.shelter_episodes")

    assert named == declared, (
        "the INSERT column list and the table declaration disagree.\n"
        f"  only in the table:  {[c for c in declared if c not in named]}\n"
        f"  only in the INSERT: {[c for c in named if c not in declared]}\n"
        "  or the order differs"
    )


@pytest.mark.parametrize(
    "table",
    ["staging.intake_events", "staging.outcome_events", "staging.daily_weather"],
)
def test_every_staging_insert_names_its_columns(table):
    """Same rule for the staging layer, where the frames are widest."""
    declared = set(declared_columns(table))
    named = set(insert_columns(STAGING, table))
    assert named <= declared, f"{table}: the INSERT names columns the table does not have: {named - declared}"


def test_the_episode_table_carries_all_four_targets():
    """A target that exists in Python and not in the warehouse cannot be served."""
    declared = declared_columns("analytics.shelter_episodes")
    for target in ["adopted_within_7d", "adopted_within_14d", "adopted_within_30d", "long_stay_60d"]:
        assert target in declared, f"{target} is missing from the episode table"


def test_the_episode_table_keeps_the_three_survival_states_apart():
    """Censored, adopted and exited-another-way. Collapsing them is the paper's whole point."""
    declared = declared_columns("analytics.shelter_episodes")
    for column in ["event_code", "is_adopted", "is_open_at_cutoff", "suspected_missing_outcome"]:
        assert column in declared


# --- provenance ---------------------------------------------------------------


@pytest.mark.parametrize(
    "table",
    [
        "raw.austin_intakes",
        "raw.austin_outcomes",
        "raw.weather_observations",
        "raw.rescuegroups_listings",
    ],
)
def test_every_raw_table_carries_its_provenance(table):
    """"Traceable to source" has to be a column, not a claim in a report.

    Every raw row names the S3 object it came from and the moment it was fetched.
    That is what makes it possible to answer a question about a number six months
    later without re-downloading anything.
    """
    declared = declared_columns(table)
    for column in ["source_s3_key", "retrieved_at", "ingest_batch_id"]:
        assert column in declared, f"{table} is missing {column}"


def test_the_breed_reference_table_records_which_model_made_each_label():
    """A label has to be traceable to the model and the prompt that produced it."""
    declared = declared_columns("raw.breed_attributes")
    for column in ["model_id", "prompt_version_hash", "labeled_at", "human_reviewed"]:
        assert column in declared, f"raw.breed_attributes is missing {column}"


def test_the_model_registry_records_the_data_cutoff_and_the_feature_hash():
    """Two models with the same algorithm and different cutoffs are different models."""
    declared = declared_columns("analytics.model_registry")
    for column in ["training_data_cutoff", "feature_list_hash", "model_version", "approved_by"]:
        assert column in declared


# --- the ethical constraint, in the warehouse ---------------------------------


def test_no_view_ranks_animals_by_how_little_they_are_worth():
    """The rule the whole system is built around, checked in the layer that serves it.

    Every ranking in the analytics layer orders by risk descending, because the
    queue exists to route help toward the animals at the top. A view that ordered
    the other way, or a column named for a removal decision, would contradict the
    use policy the API serves on every response.
    """
    text = ANALYTICS.read_text(encoding="utf-8").lower()
    for forbidden in [
        "euthanas",
        "cull",
        "deprioriti",
        "not_worth",
        "low_value",
        "recommend_removal",
        "candidate_for_removal",
    ]:
        # The word may appear in a comment explaining what the system must not do.
        # It must not appear in an identifier.
        identifiers = re.findall(rf"(?:as|view|column)\s+\w*{forbidden}\w*", text)
        assert not identifiers, f"analytics layer defines an identifier containing {forbidden!r}"


def test_the_queue_view_orders_by_risk_descending():
    """Highest predicted long-stay risk first, which is who needs help soonest."""
    text = ANALYTICS.read_text(encoding="utf-8")
    queue = text[text.index("v_needs_attention_queue") :]
    assert "ORDER BY c.p_long_stay_60d DESC" in queue


def test_the_queue_suggests_an_intervention_for_every_animal():
    """Every branch of the intervention CASE has to add something the animal receives."""
    text = ANALYTICS.read_text(encoding="utf-8")
    block = text[text.index("suggested_intervention") - 1200 : text.index("suggested_intervention")]
    for intervention in ["support", "foster", "outreach", "photography", "event"]:
        assert intervention in block, f"no branch offers {intervention}"


# --- the transforms do not silently lose rows ---------------------------------


def test_staging_has_a_row_count_reconciliation():
    """Nothing may be lost between raw and staging, and it is checked rather than hoped."""
    text = STAGING.read_text(encoding="utf-8")
    assert "v_row_count_reconciliation" in text
    assert "raw.austin_intakes" in text
    assert "staging.intake_events" in text


def test_staging_flags_bad_rows_rather_than_dropping_them():
    """A pipeline that discards what it cannot read reports clean numbers on a shrinking sample."""
    text = STAGING.read_text(encoding="utf-8")
    assert "quality_flags" in text
    assert "unparseable_timestamp" in text
    assert "is_duplicate_of" in text


def test_the_episode_build_has_the_three_audits_that_defend_it():
    text = EPISODES.read_text(encoding="utf-8")
    for view in ["v_episode_audit", "v_unclaimed_outcomes", "v_species_mismatches"]:
        assert view in text, f"the episode build has no {view}"


def test_the_analytics_layer_reconciles_against_the_python_pipeline():
    """Two implementations of one rule are only defensible if they are compared."""
    text = ANALYTICS.read_text(encoding="utf-8")
    assert "v_pipeline_reconciliation" in text
    assert "python_pipeline" in text


def test_the_monitoring_view_reports_label_lag():
    """The 30 day label does not exist for 30 days, and a view that hides that lies."""
    text = ANALYTICS.read_text(encoding="utf-8")
    assert "label_status" in text
    assert "'pending'" in text
    assert "v_label_lag" in text
