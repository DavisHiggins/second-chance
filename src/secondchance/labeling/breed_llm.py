"""Turn Austin's free text breed strings into structured attributes.

Why this exists
---------------
Austin records breed as a single free text field. There are 2,736 distinct
strings in the intake feed and the long tail is brutal: 1,651 distinct strings
are needed to cover 99 percent of dog episodes. One hot encoding that is a
recipe for a sparse, unstable model that cannot say anything sensible about a
breed it has never seen.

The strings are compositional though. "Labrador Retriever/Pit Bull Mix" is two
known tokens plus a mix marker. Split on that structure and the vocabulary
collapses from 2,736 strings to 254 atomic breed tokens, which is small enough
for a language model to label once, carefully, at a cost of a few cents.

The model is asked for attributes an adopter actually reacts to: how big the
animal gets, how much coat it has, how much exercise it needs, whether it reads
as a bully breed, and whether it is the kind of dog a landlord or insurer is
likely to refuse. Those attributes generalise to breeds the training set never
saw, which one hot encoding cannot do.

The offline result file lives at ``data/reference/breed_attributes_llm.psv`` and
is checked into the repository so the paper's numbers are reproducible without
spending money on the API. :func:`refresh_reference` regenerates it from Bedrock
when Austin publishes a breed token we have not seen.
"""

from __future__ import annotations

import json
import logging
import os
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

log = logging.getLogger(__name__)

DEFAULT_REFERENCE = (
    Path(__file__).resolve().parents[3] / "data" / "reference" / "breed_attributes_llm.psv"
)

# Bedrock model id. Kept in one place so the model card, the config file and the
# code cannot drift apart.
DEFAULT_BEDROCK_MODEL = os.environ.get(
    "SECONDCHANCE_BEDROCK_MODEL", "anthropic.claude-3-5-sonnet-20241022-v2:0"
)

GROUP_NAMES = {
    "SP": "Sporting",
    "HO": "Hound",
    "WK": "Working",
    "TE": "Terrier",
    "TO": "Toy",
    "NS": "Non-Sporting",
    "HE": "Herding",
    "FSS": "Foundation Stock Service",
    "NR": "Not AKC recognised",
    "CD": "Domestic cat",
    "CP": "Pedigree cat",
}
SIZE_NAMES = {"T": "toy", "S": "small", "M": "medium", "L": "large", "G": "giant"}
SIZE_ORDINAL = {"T": 0, "S": 1, "M": 2, "L": 3, "G": 4}
COAT_NAMES = {"H": "hairless", "S": "short", "M": "medium", "L": "long"}
COAT_ORDINAL = {"H": 0, "S": 1, "M": 2, "L": 3}
LEVEL_NAMES = {"L": "low", "M": "moderate", "H": "high", "V": "very high"}
GROOMING_ORDINAL = {"L": 0, "M": 1, "H": 2}
ENERGY_ORDINAL = {"L": 0, "M": 1, "H": 2, "V": 3}
FLAG_ORDER = ("bully_type", "brachycephalic", "guardian_or_working", "bsl_risk", "recognized_purebred")

# The prompt is stored as a constant so the model card can quote it verbatim and
# so a reviewer can see exactly what the model was asked. Changing it changes the
# labels, so it is versioned alongside the reference file.
LABELING_PROMPT = """\
You are helping an animal shelter build a structured breed reference table.

For each breed token below, return one JSON object with these exact keys:
  name                  the token, echoed back unchanged
  group                 one of: Sporting, Hound, Working, Terrier, Toy,
                        Non-Sporting, Herding, Foundation Stock Service,
                        Not AKC recognised, Domestic cat, Pedigree cat
  size                  one of: toy, small, medium, large, giant
  weight_lb             typical adult weight in pounds, integer
  coat                  one of: hairless, short, medium, long
  grooming              one of: low, moderate, high
  energy                one of: low, moderate, high, very high
  bully_type            true if the breed is commonly read by the public as a
                        "pit bull type" or bully breed dog
  brachycephalic        true if the breed is short muzzled
  guardian_or_working   true if the breed was developed to guard livestock,
                        property or people
  bsl_risk              true if the breed is commonly named in United States
                        breed specific legislation or in homeowner insurance
                        exclusion lists
  recognized_purebred   true if a major registry recognises it as a breed

Rules:
  - Tokens are shelter shorthand and may be truncated ("Doberman Pinsch",
    "Chesa Bay Retr"). Resolve them to the intended breed.
  - Some tokens are landrace or type names rather than registered breeds
    ("Pit Bull", "Blue Lacy", "Black Mouth Cur"). Set recognized_purebred false
    and group "Not AKC recognised".
  - Cat tokens that describe hair length rather than a pedigree
    ("Domestic Shorthair") get group "Domestic cat" and
    recognized_purebred false.
  - bsl_risk is descriptive of the housing market only. It must never be read as
    a statement about an individual animal's temperament.
  - If a token is genuinely unresolvable, return group "Not AKC recognised",
    recognized_purebred false, and your best guess for the rest.

Return a JSON array. No prose, no code fences.

Breed tokens:
{tokens}
"""


@dataclass(frozen=True)
class BreedAttributes:
    """One row of the structured reference."""

    name: str
    group: str
    size: str
    weight_lb: float
    coat: str
    grooming: str
    energy: str
    bully_type: bool
    brachycephalic: bool
    guardian_or_working: bool
    bsl_risk: bool
    recognized_purebred: bool

    @property
    def size_ordinal(self) -> int:
        """Size as an ordered integer, toy through giant."""
        return SIZE_ORDINAL[self.size]

    @property
    def coat_ordinal(self) -> int:
        """Coat length as an ordered integer, hairless through long."""
        return COAT_ORDINAL[self.coat]

    @property
    def grooming_ordinal(self) -> int:
        """Grooming burden as an ordered integer, low through high."""
        return GROOMING_ORDINAL[self.grooming]

    @property
    def energy_ordinal(self) -> int:
        """Energy level as an ordered integer, low through very high."""
        return ENERGY_ORDINAL[self.energy]


def _parse_row(line: str) -> BreedAttributes:
    name, group, size, weight, coat, grooming, energy, flags = line.split("|")
    if len(flags) != len(FLAG_ORDER) or set(flags) - {"0", "1"}:
        raise ValueError(f"Bad flag string {flags!r} for breed {name!r}")
    bits = [c == "1" for c in flags]
    return BreedAttributes(
        name=name,
        group=group,
        size=size,
        weight_lb=float(weight),
        coat=coat,
        grooming=grooming,
        energy=energy,
        bully_type=bits[0],
        brachycephalic=bits[1],
        guardian_or_working=bits[2],
        bsl_risk=bits[3],
        recognized_purebred=bits[4],
    )


@lru_cache(maxsize=4)
def load_reference(path: str | None = None) -> dict[str, BreedAttributes]:
    """Load the structured breed table, keyed by the exact Austin token."""
    target = Path(path) if path else DEFAULT_REFERENCE
    table: dict[str, BreedAttributes] = {}
    for raw in target.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        record = _parse_row(line)
        table[record.name] = record
    log.info("Loaded %d structured breed records from %s", len(table), target)
    return table


_MIX_SUFFIX = re.compile(r"\s+Mix$", re.IGNORECASE)


def split_breed_string(raw: str | None) -> tuple[list[str], bool]:
    """Split Austin's breed string into atomic tokens plus a mix flag.

    ``"Labrador Retriever/Pit Bull Mix"`` becomes
    ``(["Labrador Retriever", "Pit Bull"], True)``.

    The mix flag is true when the string carries the explicit "Mix" suffix or
    when two or more breeds are listed, because a slash in Austin's convention
    already means the animal is a cross.
    """
    if not isinstance(raw, str) or not raw.strip():
        return [], False
    text = raw.strip()
    explicit_mix = bool(_MIX_SUFFIX.search(text))
    text = _MIX_SUFFIX.sub("", text)
    tokens = [part.strip() for part in text.split("/") if part.strip()]
    return tokens, explicit_mix or len(tokens) > 1


def structure_breed(raw: str | None, reference: dict[str, BreedAttributes] | None = None) -> dict:
    """Produce the modelling features for one raw breed string.

    Composition rules, chosen to be boring and explainable:
      - size, weight and coat take the maximum across the listed breeds, because
        a Labrador crossed with a Chihuahua is not a Chihuahua sized dog and
        adopters shop by the upper bound of what they might get.
      - grooming and energy take the maximum for the same reason.
      - the risk style flags take the logical OR, because a cross that reads as
        part bully breed faces the same housing barriers as a full one.
      - purity takes the logical AND and is only true for a single, recognised,
        non mix token.
    """
    table = reference if reference is not None else load_reference()
    tokens, is_mix = split_breed_string(raw)
    known = [table[t] for t in tokens if t in table]

    if not known:
        return {
            "breed_tokens": len(tokens),
            "breed_resolved": 0,
            "breed_is_mix": int(is_mix),
            "breed_size_ordinal": float("nan"),
            "breed_weight_lb": float("nan"),
            "breed_coat_ordinal": float("nan"),
            "breed_grooming_ordinal": float("nan"),
            "breed_energy_ordinal": float("nan"),
            "breed_bully_type": 0,
            "breed_brachycephalic": 0,
            "breed_guardian": 0,
            "breed_bsl_risk": 0,
            "breed_purebred": 0,
            "breed_primary_group": "Unknown",
            "breed_primary_token": "Unknown",
        }

    primary = known[0]
    return {
        "breed_tokens": len(tokens),
        "breed_resolved": int(len(known) == len(tokens)),
        "breed_is_mix": int(is_mix),
        "breed_size_ordinal": float(max(b.size_ordinal for b in known)),
        "breed_weight_lb": float(max(b.weight_lb for b in known)),
        "breed_coat_ordinal": float(max(b.coat_ordinal for b in known)),
        "breed_grooming_ordinal": float(max(b.grooming_ordinal for b in known)),
        "breed_energy_ordinal": float(max(b.energy_ordinal for b in known)),
        "breed_bully_type": int(any(b.bully_type for b in known)),
        "breed_brachycephalic": int(any(b.brachycephalic for b in known)),
        "breed_guardian": int(any(b.guardian_or_working for b in known)),
        "breed_bsl_risk": int(any(b.bsl_risk for b in known)),
        "breed_purebred": int(
            all(b.recognized_purebred for b in known) and not is_mix and len(known) == 1
        ),
        "breed_primary_group": GROUP_NAMES.get(primary.group, primary.group),
        "breed_primary_token": primary.name,
    }


def build_prompt(tokens: Sequence[str]) -> str:
    """Render the labeling prompt for a batch of breed tokens."""
    listing = "\n".join(f"- {t}" for t in tokens)
    return LABELING_PROMPT.format(tokens=listing)


def refresh_reference(
    tokens: Iterable[str],
    output_path: str | Path = DEFAULT_REFERENCE,
    batch_size: int = 40,
    model_id: str = DEFAULT_BEDROCK_MODEL,
    region: str | None = None,
) -> Path:
    """Regenerate the reference file by calling Claude on Amazon Bedrock.

    This is the production path. It is not run during the offline analysis
    because the committed reference file already covers every token in the
    historical data, and re-running it would spend money to reproduce a file we
    already have. The ingestion Lambda calls this only when it meets a breed
    token that is not in the reference.

    Raises:
        RuntimeError: if boto3 is unavailable or the model returns unusable JSON
            for a batch after the retry.
    """
    try:
        import boto3  # imported lazily so offline analysis needs no AWS deps
    except ImportError as exc:  # pragma: no cover - exercised only in AWS
        raise RuntimeError("boto3 is required to refresh the breed reference") from exc

    client = boto3.client("bedrock-runtime", region_name=region or os.environ.get("AWS_REGION", "us-east-1"))
    todo = sorted(set(tokens))
    records: list[dict] = []

    for start in range(0, len(todo), batch_size):
        batch = todo[start : start + batch_size]
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 8000,
            "temperature": 0,  # labeling should be reproducible, not creative
            "messages": [{"role": "user", "content": build_prompt(batch)}],
        }
        for attempt in (1, 2):
            response = client.invoke_model(modelId=model_id, body=json.dumps(body))
            text = json.loads(response["body"].read())["content"][0]["text"].strip()
            text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as error:
                if attempt == 2:
                    raise RuntimeError(
                        f"Bedrock returned unparseable JSON for batch {start}"
                    ) from error
                log.warning("Retrying batch %d after unparseable JSON", start)
                continue
            records.extend(parsed)
            break

    _write_reference(records, Path(output_path))
    load_reference.cache_clear()
    return Path(output_path)


_REVERSE_GROUP = {v: k for k, v in GROUP_NAMES.items()}
_REVERSE_SIZE = {v: k for k, v in SIZE_NAMES.items()}
_REVERSE_COAT = {v: k for k, v in COAT_NAMES.items()}
_REVERSE_LEVEL = {v: k for k, v in LEVEL_NAMES.items()}


def _write_reference(records: list[dict], path: Path) -> None:
    """Serialise model output back into the compact pipe separated format."""
    header = DEFAULT_REFERENCE.read_text(encoding="utf-8").split("\n")
    preamble = [line for line in header if line.startswith("#")]
    lines = list(preamble)
    for record in sorted(records, key=lambda r: r["name"]):
        flags = "".join(
            "1" if record.get(flag) else "0" for flag in FLAG_ORDER
        )
        lines.append(
            "|".join(
                [
                    record["name"],
                    _REVERSE_GROUP.get(record["group"], "NR"),
                    _REVERSE_SIZE.get(record["size"], "M"),
                    str(round(float(record["weight_lb"]))),
                    _REVERSE_COAT.get(record["coat"], "S"),
                    _REVERSE_LEVEL.get(record["grooming"], "M"),
                    _REVERSE_LEVEL.get(record["energy"], "M"),
                    flags,
                ]
            )
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
