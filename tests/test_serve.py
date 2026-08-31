"""Tests for the API handler.

Two kinds of test live here. The ordinary kind checks routing, validation and
error handling. The other kind checks the two rules the module docstring says are
enforced here rather than trusted to the caller:

  - every response carries a model version and a data freshness timestamp
  - no response can be read as a recommendation to reduce what an animal receives

The second one is the project's ethical constraint. It is written in the brief,
it is in the model card, and it is stated on every screen of the website. This
file is where it stops being a promise and becomes something that fails a build.

Nothing here touches AWS. Every boto3 call goes through one indirection in the
handler, and these tests replace it.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from secondchance.serve import handler as api

VALID_ANIMAL = {
    "animal_id": "A812345",
    "animal_type": "Dog",
    "intake_type": "Stray",
    "intake_condition": "Normal",
    "sex_upon_intake": "Intact Male",
    "breed": "Labrador Retriever Mix",
    "age_at_intake_days": 730.0,
}

PREDICTION = {
    "p_adopt_7d": 0.21,
    "p_adopt_14d": 0.34,
    "p_adopt_30d": 0.47,
    "p_long_stay_60d": 0.18,
    "expected_days_in_shelter": 24.5,
    "survival_curve": [{"day": 7, "still_present": 0.79}],
    "drivers": [{"feature": "age_at_intake_days", "direction": "raises", "value": 730.0}],
    "confidence": "high",
}

METADATA = {
    "model_version": "lgbm-30d-2026-08-20",
    "data_as_of": "2026-08-19T23:00:00Z",
    "status": "ok",
}


class FakeBoto:
    """Records every call so a test can assert on what would have been sent."""

    def __init__(self, **behaviour: Any) -> None:
        self.behaviour = behaviour
        self.calls: list[tuple[str, str, dict]] = []

    def __call__(self, service: str) -> Any:
        outer = self

        class Client:
            def __getattr__(self, operation: str):
                def call(**kwargs: Any) -> Any:
                    outer.calls.append((service, operation, kwargs))
                    result = outer.behaviour.get(f"{service}.{operation}")
                    if isinstance(result, Exception):
                        raise result
                    if callable(result):
                        return result(**kwargs)
                    return result

                return call

        return Client()


@pytest.fixture
def wired(monkeypatch):
    """Patch the handler's single boto entry point and its metadata lookup."""

    def install(**behaviour: Any) -> FakeBoto:
        fake = FakeBoto(**behaviour)
        monkeypatch.setattr(api, "_boto", fake)
        monkeypatch.setattr(api, "_current_model_metadata", lambda: dict(METADATA))
        monkeypatch.setattr(api, "ENDPOINT_NAME", "secondchance-endpoint")
        monkeypatch.setenv("CURATED_BUCKET", "secondchance-curated")
        return fake

    return install


def event(route: str, **kwargs: Any) -> dict[str, Any]:
    """Build an API Gateway HTTP API v2 event."""
    return {
        "routeKey": route,
        "requestContext": {"http": {"method": kwargs.pop("method", "POST")}},
        "body": json.dumps(kwargs.pop("body")) if "body" in kwargs else None,
        "queryStringParameters": kwargs.pop("query", None),
        "pathParameters": kwargs.pop("path_parameters", None),
    }


def body_of(response: dict[str, Any]) -> dict[str, Any]:
    return json.loads(response["body"])


def s3_object(payload: Any):
    """A stand-in for the shape boto3's S3 get_object returns."""

    class Body:
        @staticmethod
        def read() -> bytes:
            return json.dumps(payload).encode("utf-8")

    return lambda **_: {"Body": Body()}


def endpoint_returning(predictions: list[dict]):
    class Body:
        @staticmethod
        def read() -> bytes:
            return json.dumps({"predictions": predictions}).encode("utf-8")

    return lambda **_: {"Body": Body()}


# --- the ethical constraint ---------------------------------------------------


def test_the_use_policy_names_the_prohibited_use_explicitly():
    """Not a vague "use responsibly". It has to say the thing it forbids."""
    text = api.USE_POLICY["prohibited_use"].lower()
    assert "euthanasia" in text
    assert "never" in text
    assert "more help, not less" in text
    assert "prioritise" in api.USE_POLICY["intended_use"].lower()


@pytest.mark.parametrize(
    ("route", "payload"),
    [
        ("POST /v1/predict", {"animal": VALID_ANIMAL}),
        ("POST /v1/predict/batch", {"animals": [VALID_ANIMAL]}),
    ],
)
def test_every_scoring_response_carries_the_use_policy(wired, route, payload):
    """A front end cannot quietly drop a banner it is handed on every request."""
    wired(**{"sagemaker-runtime.invoke_endpoint": endpoint_returning([PREDICTION])})
    response = api.lambda_handler(event(route, body=payload), None)
    assert response["statusCode"] == 200
    assert body_of(response)["use_policy"] == api.USE_POLICY


def test_the_queue_response_carries_the_use_policy(wired):
    wired(**{"s3.get_object": s3_object({"animals": [], "generated_at": "2026-08-19"})})
    response = api.lambda_handler(
        event("GET /v1/queue/needs-attention", method="GET", query={"limit": "10"}), None
    )
    assert body_of(response)["use_policy"] == api.USE_POLICY


def test_no_response_field_can_be_read_as_a_removal_recommendation(wired):
    """The API surface itself must not offer the shape of that decision.

    A field called anything like "euthanasia_risk" or "recommended_action" would
    be an invitation, whatever the documentation said, so the schema simply does
    not contain one.
    """
    wired(**{"sagemaker-runtime.invoke_endpoint": endpoint_returning([PREDICTION])})
    response = api.lambda_handler(event("POST /v1/predict", body={"animal": VALID_ANIMAL}), None)
    served = json.dumps(body_of(response)["prediction"]).lower()
    for forbidden in ["euthan", "cull", "remove", "recommend", "deprioriti", "refuse", "decline"]:
        assert forbidden not in served, f"the prediction payload mentions {forbidden!r}"


# --- provenance on every response ---------------------------------------------


def test_every_successful_route_reports_its_model_version_and_freshness(wired):
    """A number without a timestamp will eventually be a stale number acted on."""
    wired(
        **{
            "sagemaker-runtime.invoke_endpoint": endpoint_returning([PREDICTION]),
            "s3.get_object": s3_object({"animals": [], "generated_at": "2026-08-19"}),
        }
    )
    cases = [
        event("POST /v1/predict", body={"animal": VALID_ANIMAL}),
        event("POST /v1/predict/batch", body={"animals": [VALID_ANIMAL]}),
        event("GET /v1/queue/needs-attention", method="GET"),
    ]
    for case in cases:
        payload = body_of(api.lambda_handler(case, None))
        assert payload["model_version"] == METADATA["model_version"], case["routeKey"]
        assert payload["data_as_of"] == METADATA["data_as_of"], case["routeKey"]


def test_a_failed_metadata_lookup_says_unknown_rather_than_guessing(monkeypatch):
    """"Unknown" gets fixed. "Up to date" because a lookup failed does not."""
    monkeypatch.setattr(api, "MODEL_VERSION_TABLE", "secondchance-model-version")
    monkeypatch.setattr(api, "_boto", FakeBoto(**{"dynamodb.get_item": RuntimeError("no table")}))
    metadata = api._current_model_metadata()
    assert metadata["model_version"] == "unknown"
    assert metadata["data_as_of"] is None
    assert metadata["status"] == "lookup_failed"


def test_health_reports_degraded_when_the_model_version_is_unreadable(monkeypatch):
    monkeypatch.setattr(
        api, "_current_model_metadata", lambda: {"model_version": "unknown", "data_as_of": None, "status": "lookup_failed"}
    )
    response = api.lambda_handler(event("GET /v1/health", method="GET"), None)
    assert response["statusCode"] == 503
    assert body_of(response)["status"] == "degraded"


def test_health_is_green_when_metadata_reads_cleanly(wired):
    wired()
    response = api.lambda_handler(event("GET /v1/health", method="GET"), None)
    assert response["statusCode"] == 200
    assert body_of(response)["status"] == "healthy"
    assert body_of(response)["checked_at"].endswith("+00:00")


# --- validation ---------------------------------------------------------------


def test_a_missing_required_field_is_named_in_the_error(wired):
    """So that a front end developer can fix it without reading the Lambda source."""
    wired()
    incomplete = {k: v for k, v in VALID_ANIMAL.items() if k != "breed"}
    response = api.lambda_handler(event("POST /v1/predict", body={"animal": incomplete}), None)
    assert response["statusCode"] == 400
    details = body_of(response)["details"]
    assert any("breed" in d for d in details), details


@pytest.mark.parametrize("age", [-5, 20000, "quite old"])
def test_an_implausible_age_is_rejected(wired, age):
    """12000 days is nearly 33 years. Anything past that is a typo, not a cat."""
    wired()
    animal = {**VALID_ANIMAL, "age_at_intake_days": age}
    response = api.lambda_handler(event("POST /v1/predict", body={"animal": animal}), None)
    assert response["statusCode"] == 400


def test_a_missing_age_is_allowed_because_austin_often_does_not_know(wired):
    """Roughly one intake in fifty arrives with no usable age, and it still needs scoring."""
    wired(**{"sagemaker-runtime.invoke_endpoint": endpoint_returning([PREDICTION])})
    animal = {k: v for k, v in VALID_ANIMAL.items() if k != "age_at_intake_days"}
    response = api.lambda_handler(event("POST /v1/predict", body={"animal": animal}), None)
    assert response["statusCode"] == 200


def test_malformed_json_gets_a_400_not_a_500(wired):
    wired()
    broken = event("POST /v1/predict")
    broken["body"] = "{not json"
    response = api.lambda_handler(broken, None)
    assert response["statusCode"] == 400
    assert body_of(response)["error"] == "invalid_json"


def test_an_empty_batch_is_refused_with_a_reason(wired):
    wired()
    response = api.lambda_handler(event("POST /v1/predict/batch", body={"animals": []}), None)
    assert response["statusCode"] == 400
    assert "non-empty" in " ".join(body_of(response)["details"])


def test_an_oversized_batch_is_refused_and_told_what_to_do_instead(wired):
    """413 with a hint, because the caller has a cheaper route available."""
    wired()
    payload = {"animals": [VALID_ANIMAL] * 501}
    response = api.lambda_handler(event("POST /v1/predict/batch", body=payload), None)
    assert response["statusCode"] == 413
    assert "queue" in body_of(response)["hint"].lower()


def test_batch_validation_reports_which_row_was_bad(wired):
    wired()
    bad = {k: v for k, v in VALID_ANIMAL.items() if k != "intake_type"}
    response = api.lambda_handler(
        event("POST /v1/predict/batch", body={"animals": [VALID_ANIMAL, bad]}), None
    )
    assert response["statusCode"] == 400
    details = body_of(response)["details"]
    assert "1" in details, "the failing row index must be identifiable"


# --- routing and failure modes ------------------------------------------------


def test_a_preflight_request_is_answered_without_touching_the_model(wired):
    fake = wired()
    response = api.lambda_handler(event("OPTIONS /v1/predict", method="OPTIONS"), None)
    assert response["statusCode"] == 204
    assert fake.calls == []


def test_an_unknown_route_is_a_404_that_names_the_route(wired):
    wired()
    response = api.lambda_handler(event("GET /v1/nonsense", method="GET"), None)
    assert response["statusCode"] == 404
    assert body_of(response)["route"] == "GET /v1/nonsense"


def test_a_queue_read_failure_is_a_503_not_an_empty_queue(wired):
    """An empty list would read as "no animals need help", which is a lie."""
    wired(**{"s3.get_object": RuntimeError("bucket unreachable")})
    response = api.lambda_handler(event("GET /v1/queue/needs-attention", method="GET"), None)
    assert response["statusCode"] == 503
    assert body_of(response)["error"] == "queue_unavailable"


def test_a_missing_animal_is_a_404(wired):
    wired(**{"s3.get_object": RuntimeError("no such key")})
    response = api.lambda_handler(
        event("GET /v1/animals/{animalId}", method="GET", path_parameters={"animalId": "A000000"}),
        None,
    )
    assert response["statusCode"] == 404
    assert body_of(response)["animal_id"] == "A000000"


def test_an_animal_lookup_returns_the_stored_record(wired):
    record = {"animal_id": "A812345", "name": "Rufus", "risk_band": "serious"}
    wired(**{"s3.get_object": s3_object(record)})
    response = api.lambda_handler(
        event("GET /v1/animals/{animalId}", method="GET", path_parameters={"animalId": "A812345"}),
        None,
    )
    assert response["statusCode"] == 200
    assert body_of(response)["animal"] == record


def test_an_unexpected_endpoint_failure_becomes_a_500_not_a_stack_trace(wired):
    wired(**{"sagemaker-runtime.invoke_endpoint": RuntimeError("endpoint cold")})
    response = api.lambda_handler(event("POST /v1/predict", body={"animal": VALID_ANIMAL}), None)
    assert response["statusCode"] == 500
    assert body_of(response)["error"] == "internal_error"


# --- queue behaviour ----------------------------------------------------------


def test_the_queue_respects_the_limit_and_reports_the_true_total(wired):
    """Truncating silently would make the shelter think the queue was shorter."""
    animals = [{"animal_id": f"A{i}", "animal_type": "Dog"} for i in range(80)]
    wired(**{"s3.get_object": s3_object({"animals": animals, "generated_at": "2026-08-19"})})
    response = api.lambda_handler(
        event("GET /v1/queue/needs-attention", method="GET", query={"limit": "10"}), None
    )
    payload = body_of(response)
    assert len(payload["animals"]) == 10
    assert payload["total_available"] == 80


def test_the_queue_limit_is_capped(wired):
    animals = [{"animal_id": f"A{i}", "animal_type": "Dog"} for i in range(400)]
    wired(**{"s3.get_object": s3_object({"animals": animals, "generated_at": "2026-08-19"})})
    response = api.lambda_handler(
        event("GET /v1/queue/needs-attention", method="GET", query={"limit": "9999"}), None
    )
    assert len(body_of(response)["animals"]) == 200


def test_the_queue_species_filter_is_case_insensitive(wired):
    animals = [
        {"animal_id": "A1", "animal_type": "Dog"},
        {"animal_id": "A2", "animal_type": "Cat"},
        {"animal_id": "A3", "animal_type": "Dog"},
    ]
    wired(**{"s3.get_object": s3_object({"animals": animals, "generated_at": "2026-08-19"})})
    response = api.lambda_handler(
        event("GET /v1/queue/needs-attention", method="GET", query={"species": "dog"}), None
    )
    payload = body_of(response)
    assert [a["animal_id"] for a in payload["animals"]] == ["A1", "A3"]
    assert payload["total_available"] == 2


# --- prediction logging -------------------------------------------------------


def test_predictions_are_logged_for_later_drift_analysis(wired, monkeypatch):
    """The monitoring pipeline has nothing to monitor if this stops happening."""
    monkeypatch.setattr(api, "PREDICTION_LOG_STREAM", "secondchance-predictions")
    fake = wired(**{"sagemaker-runtime.invoke_endpoint": endpoint_returning([PREDICTION])})
    api.lambda_handler(event("POST /v1/predict", body={"animal": VALID_ANIMAL}), None)

    puts = [c for c in fake.calls if c[1] == "put_records"]
    assert len(puts) == 1
    record = json.loads(puts[0][2]["Records"][0]["Data"])
    assert record["model_version"] == METADATA["model_version"]
    assert record["features"]["animal_id"] == "A812345"
    assert record["prediction"]["p_adopt_30d"] == PREDICTION["p_adopt_30d"]


def test_a_logging_failure_does_not_fail_the_request(wired, monkeypatch):
    """Losing a monitoring record is smaller than failing a request staff are waiting on."""
    monkeypatch.setattr(api, "PREDICTION_LOG_STREAM", "secondchance-predictions")
    wired(
        **{
            "sagemaker-runtime.invoke_endpoint": endpoint_returning([PREDICTION]),
            "kinesis.put_records": RuntimeError("stream throttled"),
        }
    )
    response = api.lambda_handler(event("POST /v1/predict", body={"animal": VALID_ANIMAL}), None)
    assert response["statusCode"] == 200


def test_nothing_is_logged_when_no_stream_is_configured(wired, monkeypatch):
    monkeypatch.setattr(api, "PREDICTION_LOG_STREAM", "")
    fake = wired(**{"sagemaker-runtime.invoke_endpoint": endpoint_returning([PREDICTION])})
    api.lambda_handler(event("POST /v1/predict", body={"animal": VALID_ANIMAL}), None)
    assert not [c for c in fake.calls if c[0] == "kinesis"]


# --- response shape -----------------------------------------------------------


def test_cors_headers_are_present_on_every_response(wired):
    wired()
    response = api.lambda_handler(event("GET /v1/nonsense", method="GET"), None)
    assert response["headers"]["Content-Type"] == "application/json"
    assert "Access-Control-Allow-Origin" in response["headers"]


def test_the_response_body_is_always_a_json_string(wired):
    """API Gateway rejects a dict body, and the failure surfaces as a 502."""
    wired(**{"sagemaker-runtime.invoke_endpoint": endpoint_returning([PREDICTION])})
    response = api.lambda_handler(event("POST /v1/predict", body={"animal": VALID_ANIMAL}), None)
    assert isinstance(response["body"], str)
    json.loads(response["body"])


def test_a_prediction_reports_its_own_latency(wired):
    wired(**{"sagemaker-runtime.invoke_endpoint": endpoint_returning([PREDICTION])})
    response = api.lambda_handler(event("POST /v1/predict", body={"animal": VALID_ANIMAL}), None)
    latency = body_of(response)["latency_ms"]
    assert isinstance(latency, (int, float))
    assert latency >= 0


def test_a_prediction_carries_its_confidence_and_drivers(wired):
    """Both are contractual: the website renders an interval and an explanation."""
    wired(**{"sagemaker-runtime.invoke_endpoint": endpoint_returning([PREDICTION])})
    prediction = body_of(
        api.lambda_handler(event("POST /v1/predict", body={"animal": VALID_ANIMAL}), None)
    )["prediction"]
    assert prediction["confidence"] == "high"
    assert prediction["drivers"] == PREDICTION["drivers"]
    assert prediction["survival_curve"] == PREDICTION["survival_curve"]


def test_a_prediction_missing_its_confidence_says_unknown_not_high(wired):
    """The default has to be the cautious one."""
    stripped = {k: v for k, v in PREDICTION.items() if k != "confidence"}
    wired(**{"sagemaker-runtime.invoke_endpoint": endpoint_returning([stripped])})
    prediction = body_of(
        api.lambda_handler(event("POST /v1/predict", body={"animal": VALID_ANIMAL}), None)
    )["prediction"]
    assert prediction["confidence"] == "unknown"


def test_an_animal_can_be_posted_at_the_top_level_or_nested(wired):
    """Both shapes appear in the wild, and rejecting one is a pointless 400."""
    wired(**{"sagemaker-runtime.invoke_endpoint": endpoint_returning([PREDICTION])})
    nested = api.lambda_handler(event("POST /v1/predict", body={"animal": VALID_ANIMAL}), None)
    flat = api.lambda_handler(event("POST /v1/predict", body=VALID_ANIMAL), None)
    assert nested["statusCode"] == flat["statusCode"] == 200
    assert body_of(nested)["prediction"] == body_of(flat)["prediction"]
