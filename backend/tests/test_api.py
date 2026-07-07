from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def build_client(tmp_path: Path) -> TestClient:
    app = create_app(storage_file=tmp_path / "tickets.json")
    return TestClient(app)


def test_health_includes_version(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "1.0.0"}


def test_ticket_creation_and_open_queue(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    created = client.post("/api/tickets")
    assert created.status_code == 200

    payload = created.json()
    assert payload["ticket"]["number"] == "A-0001"
    assert payload["ticket"]["status"] == "open"

    queue = client.get("/api/tickets/open")
    assert queue.status_code == 200
    assert len(queue.json()["tickets"]) == 1


def test_claim_ticket_closes_and_removes_from_open_queue(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    created = client.post("/api/tickets").json()["ticket"]

    claimed = client.post(f"/api/tickets/{created['id']}/claim")
    assert claimed.status_code == 200
    assert claimed.json()["ticket"]["status"] == "closed"

    queue = client.get("/api/tickets/open").json()["tickets"]
    assert queue == []

    status = client.get(f"/api/tickets/{created['id']}")
    assert status.status_code == 200
    assert status.json()["ticket"]["status"] == "closed"


def test_revoke_ticket_closes_ticket_as_user(tmp_path: Path) -> None:
    client = build_client(tmp_path)
    created = client.post("/api/tickets").json()["ticket"]

    revoked = client.post(f"/api/tickets/{created['id']}/revoke")
    assert revoked.status_code == 200
    payload = revoked.json()["ticket"]
    assert payload["status"] == "closed"
    assert payload["closed_by"] == "user"

    queue = client.get("/api/tickets/open").json()["tickets"]
    assert queue == []


def test_estimate_returns_people_ahead_and_wait(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    first = client.post("/api/tickets").json()["ticket"]
    second = client.post("/api/tickets").json()["ticket"]

    estimate = client.get(f"/api/tickets/{second['id']}/estimate")
    assert estimate.status_code == 200
    payload = estimate.json()
    assert payload["ticket_id"] == second["id"]
    assert payload["people_ahead"] == 1
    assert payload["average_service_minutes"] >= 1
    assert payload["estimated_wait_minutes"] == payload["people_ahead"] * payload["average_service_minutes"]

    client.post(f"/api/tickets/{first['id']}/claim")
    refreshed = client.get(f"/api/tickets/{second['id']}/estimate").json()
    assert refreshed["people_ahead"] == 0

