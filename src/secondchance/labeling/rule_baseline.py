"""A keyword baseline for breed structuring, so the LLM has something to beat.

Claiming "we used an LLM and it helped" is worthless without a comparison to the
obvious cheap alternative. The obvious cheap alternative is a keyword list: look
for "Miniature" or "Toy" and call it small, look for "Pit Bull" and set the bully
flag, look for "Longhair" and set the coat.

This module implements that baseline honestly, meaning it is a good faith attempt
rather than a straw man. It was written by reading the actual breed vocabulary and
adding every keyword rule that a careful engineer would add in an afternoon. It
covers the head of the distribution well. Where it fails is the tail, which is
exactly the part the shelter cares about, because rare breeds are the ones with no
training examples.
"""

from __future__ import annotations

import re

from .breed_llm import split_breed_string

# Size keywords, most specific first. These catch a real and useful chunk of the
# vocabulary: "Miniature Poodle", "Toy Fox Terrier", "Giant Schnauzer".
_SIZE_KEYWORDS: list[tuple[re.Pattern, int]] = [
    (re.compile(r"\b(toy|teacup)\b", re.I), 0),
    (re.compile(r"\b(miniature|mini)\b", re.I), 1),
    (re.compile(r"\b(standard)\b", re.I), 2),
    (re.compile(r"\b(giant)\b", re.I), 4),
    # Words that reliably imply a big dog on their own.
    (re.compile(r"\b(mastiff|great dane|wolfhound|newfoundland|st\.? bernard|pyrenees)\b", re.I), 4),
    (re.compile(r"\b(retriever|shepherd|rottweiler|doberman|husky|malamute|hound|setter|pointer)\b", re.I), 3),
    (re.compile(r"\b(chihuahua|pomeranian|maltese|papillon|pekingese|yorkshire|pug|shih tzu)\b", re.I), 1),
    (re.compile(r"\b(terrier|spaniel|corgi|dachshund|schnauzer|poodle|beagle)\b", re.I), 1),
]

_COAT_KEYWORDS: list[tuple[re.Pattern, int]] = [
    (re.compile(r"\b(hairless|sphynx|xolo)\b", re.I), 0),
    (re.compile(r"\b(longhair|long hair|rough coat|longhaired)\b", re.I), 3),
    (re.compile(r"\b(medium hair|wirehair|wire hair|wirehaired)\b", re.I), 2),
    (re.compile(r"\b(shorthair|short hair|smooth coat|smooth)\b", re.I), 1),
]

_BULLY = re.compile(
    r"\b(pit bull|staffordshire|staffordshire terrier|bull terrier|american bulldog|"
    r"cane corso|presa|dogo|boerboel|bulldog)\b",
    re.I,
)
_BRACHY = re.compile(
    r"\b(pug|bulldog|boxer|shih tzu|pekingese|persian|himalayan|boston terrier|"
    r"brussels|affenpinscher|chin|sharpei|exotic shorthair)\b",
    re.I,
)
_GUARDIAN = re.compile(
    r"\b(shepherd|mastiff|rottweiler|doberman|akita|pyrenees|kuvasz|kangal|"
    r"anatol|corso|boerboel|presa|malinois|tibetan mastiff)\b",
    re.I,
)
_BSL = re.compile(
    r"\b(pit bull|staffordshire|rottweiler|doberman|german shepherd|chow|"
    r"akita|husky|malamute|mastiff|wolf|presa|corso|dogo)\b",
    re.I,
)


def structure_breed_rules(raw: str | None) -> dict:
    """Keyword only version of :func:`secondchance.labeling.breed_llm.structure_breed`.

    Returns the same feature keys so the two can be swapped in the model matrix
    without touching anything else.
    """
    tokens, is_mix = split_breed_string(raw)
    text = raw if isinstance(raw, str) else ""

    size = None
    for pattern, value in _SIZE_KEYWORDS:
        if pattern.search(text):
            size = value if size is None else max(size, value)
    coat = None
    for pattern, value in _COAT_KEYWORDS:
        if pattern.search(text):
            coat = value if coat is None else max(coat, value)

    return {
        "breed_tokens": len(tokens),
        # The baseline "resolves" a string whenever any keyword fired at all.
        "breed_resolved": int(size is not None or coat is not None),
        "breed_is_mix": int(is_mix),
        "breed_size_ordinal": float(size) if size is not None else float("nan"),
        # The keyword approach has no way to guess a weight, which is itself a
        # finding worth reporting.
        "breed_weight_lb": float("nan"),
        "breed_coat_ordinal": float(coat) if coat is not None else float("nan"),
        "breed_grooming_ordinal": float("nan"),
        "breed_energy_ordinal": float("nan"),
        "breed_bully_type": int(bool(_BULLY.search(text))),
        "breed_brachycephalic": int(bool(_BRACHY.search(text))),
        "breed_guardian": int(bool(_GUARDIAN.search(text))),
        "breed_bsl_risk": int(bool(_BSL.search(text))),
        "breed_purebred": int(not is_mix and len(tokens) == 1),
        "breed_primary_group": "Unknown",
        "breed_primary_token": tokens[0] if tokens else "Unknown",
    }
