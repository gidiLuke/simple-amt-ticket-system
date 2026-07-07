from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def build_client(tmp_path: Path) -> TestClient:
    app = create_app(storage_file=tmp_path / "tickets.json")
    return TestClient(app)


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

