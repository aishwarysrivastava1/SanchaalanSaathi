"""Smoke tests that need no database.

These check the things most likely to break silently on a config change:
routing, auth rejection, CORS, and the module-split switch. Anything that needs
real rows lives in the integration suite (see docs/DEPLOYMENT.md).
"""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-that-is-long-enough-32")
os.environ.setdefault("DEPLOYMENT_ENV", "development")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.security import (  # noqa: E402
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.main import create_app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as test_client:
        yield test_client


def test_health_is_dependency_free(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_ready_reports_dependencies(client):
    response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert "database" in body and "redis" in body


def test_protected_route_requires_a_token(client):
    assert client.get("/api/ngo/dashboard").status_code == 401
    assert client.get("/api/volunteer/dashboard").status_code == 401


def test_garbage_token_is_rejected(client):
    response = client.get(
        "/api/ngo/dashboard", headers={"Authorization": "Bearer not-a-jwt"}
    )
    assert response.status_code == 401


def test_volunteer_token_cannot_reach_admin_routes(client):
    token = create_access_token("u1", "volunteer", "ngo1", "v@example.org")
    response = client.get("/api/ngo/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_admin_without_ngo_is_pushed_to_setup(client):
    token = create_access_token("u2", "ngo_admin", None, "a@example.org")
    response = client.get("/api/ngo/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert "setup" in response.json()["detail"].lower()


def test_every_error_carries_a_request_id(client):
    response = client.get("/api/ngo/dashboard")
    assert "request_id" in response.json()
    assert response.headers.get("X-Request-ID")


def test_websocket_refuses_a_connection_with_no_token(client):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as excinfo, client.websocket_connect(
        "/api/realtime/ws"
    ) as ws:
        ws.receive_text()
    assert excinfo.value.code == 4001


def test_websocket_refuses_a_bad_token(client):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as excinfo, client.websocket_connect(
        "/api/realtime/ws?token=garbage"
    ) as ws:
        ws.receive_text()
    assert excinfo.value.code == 4003


def test_websocket_accepts_a_valid_token(client):
    token = create_access_token("u3", "ngo_admin", "ngo1", "a@example.org")
    with client.websocket_connect(f"/api/realtime/ws?token={token}") as ws:
        hello = ws.receive_json()
        assert hello["event"] == "connected"
        assert hello["payload"]["ngo_id"] == "ngo1"


def test_passwords_round_trip_and_reject_wrong_input():
    digest = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", digest)
    assert not verify_password("wrong", digest)
    assert not verify_password("anything", None)


def test_access_token_round_trips_its_claims():
    token = create_access_token("u1", "volunteer", "ngo9", "x@example.org")
    payload = decode_token(token, expected_type="access")
    assert payload["sub"] == "u1"
    assert payload["role"] == "volunteer"
    assert payload["ngo_id"] == "ngo9"


def test_a_refresh_token_is_not_accepted_as_an_access_token():
    token, jti = create_refresh_token("u1")
    assert jti
    with pytest.raises(TokenError):
        decode_token(token, expected_type="access")


def test_legacy_django_tokens_still_authenticate():
    """Tokens minted by the old backend carry no `type` claim.

    If this breaks, every signed-in user is logged out the moment traffic
    shifts to the new service.
    """
    import jwt

    from app.core.config import settings

    legacy = jwt.encode(
        {
            "sub": "u1",
            "role": "ngo_admin",
            "ngo_id": "ngo1",
            "email": "a@example.org",
            "exp": 9_999_999_999,
        },
        settings.jwt_secret_key,
        algorithm="HS256",
    )
    payload = decode_token(legacy, expected_type="access")
    assert payload["sub"] == "u1"


def test_logout_works_with_no_body(client):
    """The frontend posts to /logout with no payload; that must not 422."""
    response = client.post("/api/auth/logout")
    assert response.status_code == 200


def test_logout_accepts_a_refresh_token(client):
    token, _ = create_refresh_token("u1")
    response = client.post("/api/auth/logout", json={"refresh_token": token})
    assert response.status_code == 200


def test_refresh_rejects_an_access_token(client):
    access = create_access_token("u1", "volunteer", "ngo1", "v@example.org")
    response = client.post("/api/auth/refresh", json={"refresh_token": access})
    assert response.status_code == 401


def test_signup_validates_its_payload(client):
    response = client.post("/api/auth/signup", json={"email": "nope", "password": "x", "role": "volunteer"})
    assert response.status_code == 422
    assert "detail" in response.json()


def test_cors_allows_the_configured_frontend_origin(client):
    response = client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_cors_does_not_reflect_an_unknown_origin(client):
    response = client.options(
        "/api/auth/login",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.headers.get("access-control-allow-origin") != "https://evil.example"


def test_security_headers_are_present(client):
    headers = client.get("/health").headers
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"


def test_simulation_rejects_an_unknown_strategy(client):
    token = create_access_token("u1", "ngo_admin", "ngo1", "a@example.org")
    response = client.post(
        "/api/sim/run",
        headers={"Authorization": f"Bearer {token}"},
        json={"params": {"strategy": "nonsense", "num_steps": 10}},
    )
    assert response.status_code == 422


def test_simulation_rejects_an_out_of_range_step_count(client):
    token = create_access_token("u1", "ngo_admin", "ngo1", "a@example.org")
    response = client.post(
        "/api/sim/run",
        headers={"Authorization": f"Bearer {token}"},
        json={"params": {"num_steps": 99999}},
    )
    assert response.status_code == 422


def test_ingest_endpoints_require_an_ngo(client):
    """All three ingest routes write into the NGO's graph, so they need one."""
    volunteer = create_access_token("u1", "volunteer", "ngo1", "v@example.org")
    for path in ("/api/ingest/text", "/api/ingest/document", "/api/ingest/voice"):
        response = client.post(path, headers={"Authorization": f"Bearer {volunteer}"})
        assert response.status_code == 403, path
