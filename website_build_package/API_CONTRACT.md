# SecondChance API contract

Base URL comes from `VITE_API_BASE_URL`. When it is unset the app runs in static
mode against `data/`, and the shapes below are exactly the shapes of those
fixtures. Generate the TypeScript types from this document and put them in
`src/types/api.ts`.

Every response, without exception, carries `model_version`, `data_as_of` and
`use_policy`. If a response arrives without them, treat it as an error and fall
back to the fixture.

---

## Conventions

- All timestamps are ISO 8601 with an explicit offset.
- All probabilities are floats in `[0, 1]`. The UI formats them as whole percents;
  the API never sends a percentage.
- All durations are in days, as floats.
- `null` means "not measured". It never means zero, and the UI renders it as
  "not measured" rather than "0".
- Errors use the shape in the last section. Never a bare string.

---

## `GET /v1/health`

Cheap liveness plus freshness. The header polls this every 5 minutes in live
mode.

```json
{
  "status": "healthy",
  "model_version": "sc-adopt30-2022-03-04-a1",
  "data_as_of": "2022-03-04T11:25:00-06:00",
  "checked_at": "2022-03-04T14:02:11Z"
}
```

`status` is `"healthy"` or `"degraded"`. Degraded returns HTTP 503 and still
carries the fields. The header renders degraded as the critical freshness chip.

---

## `POST /v1/predict`

Score one animal.

**Request**

```json
{
  "animal": {
    "animal_id": "A786884",
    "animal_type": "Dog",
    "breed": "Beagle Mix",
    "color": "Tricolor",
    "sex_upon_intake": "Neutered Male",
    "age_at_intake_days": 730.5,
    "intake_type": "Stray",
    "intake_condition": "Normal",
    "found_location": "2501 Magin Meadow Dr in Austin (TX)",
    "name": "Brock",
    "intake_datetime": "2019-01-03T16:19:00-06:00"
  }
}
```

Required: `animal_type`, `intake_type`, `intake_condition`, `sex_upon_intake`,
`breed`. Everything else is optional and the server imputes it the same way the
training pipeline did. **The client never computes a derived feature.** Breed
structuring, age banding, colour parsing and shelter occupancy all happen server
side, because a client-side reimplementation will drift from the training code
and nobody will notice for months.

**Response 200**

```json
{
  "prediction": {
    "p_adopt_7d": 0.184,
    "p_adopt_14d": 0.297,
    "p_adopt_30d": 0.412,
    "p_long_stay_60d": 0.163,
    "expected_days_in_shelter": 21.4,
    "interval": {
      "p_adopt_30d": [0.351, 0.474],
      "expected_days_in_shelter": [14.2, 33.8]
    },
    "survival_curve": [
      { "day": 1, "still_in_shelter": 0.962, "adopted_by": 0.021 },
      { "day": 7, "still_in_shelter": 0.741, "adopted_by": 0.184 },
      { "day": 14, "still_in_shelter": 0.588, "adopted_by": 0.297 },
      { "day": 30, "still_in_shelter": 0.409, "adopted_by": 0.412 },
      { "day": 60, "still_in_shelter": 0.284, "adopted_by": 0.492 },
      { "day": 90, "still_in_shelter": 0.231, "adopted_by": 0.523 }
    ],
    "drivers": [
      { "feature": "age_at_intake_days", "label": "2 years old", "contribution": -0.081, "direction": "lowers" },
      { "feature": "intake_condition", "label": "arrived in normal condition", "contribution": 0.063, "direction": "raises" },
      { "feature": "breed_bully_type", "label": "not a bully-type breed", "contribution": 0.024, "direction": "raises" }
    ],
    "confidence": "high"
  },
  "model_version": "sc-adopt30-2022-03-04-a1",
  "data_as_of": "2022-03-04T11:25:00-06:00",
  "use_policy": {
    "intended_use": "Prioritise photography, foster placement, behaviour support, adoption events and outreach for animals the model expects to wait longest.",
    "prohibited_use": "This score must never inform euthanasia, intake refusal, or any decision that reduces the care an animal receives. A low predicted adoption probability is a request for more help, not less."
  },
  "latency_ms": 41.2
}
```

Notes for the UI:

- `survival_curve.still_in_shelter` and `adopted_by` do **not** sum to one. The
  remainder is the chance of leaving by some route other than adoption (transfer,
  return to owner). Label the chart accordingly; do not draw it as a two-way
  split.
- `confidence` is `"high" | "moderate" | "low"`, derived server side from how
  similar the animal is to the training population. `"low"` means the animal sits
  outside what the model has seen, and the UI must show the caveat string from
  `CONTENT.md`, not just a smaller number.
- `drivers` is already sorted by absolute contribution and already carries a
  human-readable `label`. The client does not translate feature names.

---

## `POST /v1/predict/batch`

Same animal shape, in an `animals` array, maximum 500. Returns
`{ "predictions": [...], "count": n, ... }` with the same envelope. Over 500
returns HTTP 413 with a hint pointing at the queue endpoint.

---

## `GET /v1/queue/needs-attention`

The precomputed ranked queue. Query parameters: `limit` (default 25, max 200),
`species` (`Dog` or `Cat`), `min_risk` (float).

```json
{
  "animals": [
    {
      "animal_id": "A812345",
      "episode_id": "A812345-1",
      "name": "Juniper",
      "name_is_shelter_assigned": false,
      "animal_type": "Dog",
      "breed": "Pit Bull Mix",
      "breed_primary_group": "Not AKC recognised",
      "color": "Blue/White",
      "age_band": "young_adult",
      "age_at_intake_days": 1095,
      "sex_upon_intake": "Intact Female",
      "intake_type": "Stray",
      "intake_condition": "Normal",
      "intake_datetime": "2021-11-02T09:14:00-05:00",
      "days_in_care": 41,
      "photo_url": null,
      "p_adopt_7d": 0.061,
      "p_adopt_14d": 0.109,
      "p_adopt_30d": 0.187,
      "p_long_stay_60d": 0.688,
      "expected_days_in_shelter": 63.2,
      "risk_band": "critical",
      "drivers": [
        { "feature": "breed_bully_type", "label": "bully-type breed label", "contribution": -0.052, "direction": "lowers" }
      ],
      "suggested_channel": "photography"
    }
  ],
  "total_available": 214,
  "generated_at": "2022-03-04T06:00:00-06:00",
  "model_version": "sc-adopt30-2022-03-04-a1",
  "data_as_of": "2022-03-04T11:25:00-06:00",
  "use_policy": { }
}
```

`risk_band` is `"critical" | "serious" | "warning" | "ok"`, thresholded server
side at 0.7, 0.5 and 0.3 on `p_long_stay_60d`. The client must not re-derive it;
one place owns the thresholds.

`photo_url` is frequently `null`. The monogram tile in `PRODUCT_SPEC.md` is the
normal case, not the error case.

---

## `GET /v1/animals/{animalId}`

Everything the detail page needs in one call.

```json
{
  "animal": {
    "animal_id": "A812345",
    "profile": { },
    "prediction": { },
    "timeline": [
      { "event": "intake", "at": "2021-11-02T09:14:00-05:00", "detail": "Stray, normal condition, found on Manor Rd" },
      { "event": "prior_episode", "at": "2020-06-14T11:02:00-05:00", "detail": "Returned to owner after 3 days" }
    ],
    "similar_animals": [
      { "animal_id": "A701122", "name": "Rocket", "breed": "Pit Bull Mix", "days_to_outcome": 74, "outcome": "Adoption", "similarity": 0.94 }
    ],
    "interventions": [
      {
        "channel": "photography",
        "rationale": "Animals with no photograph in this dataset wait longer at every horizon.",
        "evidence": "measured",
        "evidence_detail": "Not measured in this dataset; Austin's export carries no photograph field.",
        "staff_minutes": 20
      }
    ]
  },
  "model_version": "sc-adopt30-2022-03-04-a1",
  "data_as_of": "2022-03-04T11:25:00-06:00",
  "use_policy": { }
}
```

**`evidence` is `"measured" | "assumed"` and the UI must render the difference
visibly.** A measured claim gets the figure and a link to the model page. An
assumed claim gets an "assumption" chip and the assumed value in plain sight. The
fixture is honest about which is which; keep it that way.

---

## `GET /v1/model/summary`

Everything on `/model`. In static mode this is `MEASURED_RESULTS.json` verbatim.
Its top-level keys are `split`, `cohort`, `block_counts`, `targets`,
`subgroups`, `ablations`, `survival`, `drift`, `interpretability` and
`metadata`. The route reads it and renders; it does not compute.

---

## Errors

```json
{
  "error": "validation_failed",
  "details": ["missing required field: breed"],
  "request_id": "01HQ8X..."
}
```

| Code | HTTP | UI behaviour |
|---|---|---|
| `validation_failed` | 400 | inline field errors, no toast |
| `not_found` | 404 | the route's empty state, not an error banner |
| `batch_too_large` | 413 | inline hint, retry with a smaller batch |
| `rate_limited` | 429 | back off, retry twice with jitter, then fall back to fixture |
| `queue_unavailable` | 503 | fall back to the fixture and show the sample-data chip |
| `internal_error` | 500 | error state with a retry button and the `request_id` |

**The fallback rule.** Any 5xx or network failure falls back to the bundled
fixture *and* sets a global `usingFallbackData` flag that renders the sample-data
chip in the header. Falling back silently would make the product commit the exact
sin it exists to warn about.

---

## Static mode

`src/lib/dataSource.ts` exposes the same functions in both modes:

```ts
export interface DataSource {
  getHealth(): Promise<Health>;
  getQueue(params: QueueParams): Promise<QueueResponse>;
  getAnimal(id: string): Promise<AnimalResponse>;
  getModelSummary(): Promise<ModelSummary>;
  getDashboard(): Promise<DashboardResponse>;
  predict(animal: AnimalInput): Promise<PredictionResponse>;
}
```

In static mode:

- `predict` looks the animal up in `data/queue.json` by id and returns its stored
  prediction. If the id is unknown it returns a `not_found` error rather than
  inventing a score. **The client must never run a model.**
- `getHealth` returns the fixture's own `data_as_of` with
  `status: "healthy"` and the sample-data flag set.
- Every call resolves after a 120ms artificial delay so the loading states are
  actually exercised during development. Set `VITE_FIXTURE_DELAY=0` to disable.

---

## Files in `data/`

| File | Shape |
|---|---|
| `metadata.json` | model version, data timestamps, census, headline rates |
| `queue.json` | `{ animals: [...] }`, 250 real held-out animals with real scores |
| `animals/{id}.json` | full detail payload for each animal in the queue |
| `trends.json` | monthly census, intake and adoption counts, 2013 to 2022 |
| `forecast.json` | 30-day census projection with interval and a `method` field |
| `segments.json` | median predicted days by life stage, species and breed group |
| `model_summary.json` | a copy of `MEASURED_RESULTS.json` |
| `interventions.json` | channel catalogue with evidence status and staff minutes |

Every animal in `queue.json` is a real record from the held-out test block with a
real model score. None are invented. The names are the names Austin published.
