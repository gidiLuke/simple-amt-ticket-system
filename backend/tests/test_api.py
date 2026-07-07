import hashlib
import hmac
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def build_client(
    tmp_path: Path,
    deploy_runner=None,
) -> TestClient:
    app = create_app(storage_file=tmp_path / "tickets.json", deploy_runner=deploy_runner)
    return TestClient(app)


def github_signature(secret: str, payload: dict[str, object]) -> str:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


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


def test_github_webhook_rejects_invalid_signature(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", "top-secret")
    client = build_client(tmp_path)

    response = client.post(
        "/api/deploy/github",
        json={"ref": "refs/heads/main"},
        headers={
            "X-GitHub-Event": "push",
            "X-Hub-Signature-256": "sha256=bad",
        },
    )

    assert response.status_code == 401


def test_github_webhook_runs_deploy_for_main_push(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", "top-secret")
    called = {}

    def fake_runner(repo_dir: Path, remote: str, branch: str, wsgi_file: Path | None) -> None:
        called["repo_dir"] = repo_dir
        called["remote"] = remote
        called["branch"] = branch
        called["wsgi_file"] = wsgi_file

    client = build_client(tmp_path, deploy_runner=fake_runner)
    payload = {"ref": "refs/heads/main"}

    response = client.post(
        "/api/deploy/github",
        content=json.dumps(payload, separators=(",", ":")),
        headers={
            "Content-Type": "application/json",
            "X-GitHub-Event": "push",
            "X-Hub-Signature-256": github_signature("top-secret", payload),
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "updated"}
    assert called["remote"] == "origin"
    assert called["branch"] == "main"
    assert called["wsgi_file"] is None


def test_github_webhook_ignores_other_branches(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", "top-secret")
    called = False

    def fake_runner(repo_dir: Path, remote: str, branch: str, wsgi_file: Path | None) -> None:
        nonlocal called
        called = True

    client = build_client(tmp_path, deploy_runner=fake_runner)
    payload = {"ref": "refs/heads/feature/demo"}

    response = client.post(
        "/api/deploy/github",
        content=json.dumps(payload, separators=(",", ":")),
        headers={
            "Content-Type": "application/json",
            "X-GitHub-Event": "push",
            "X-Hub-Signature-256": github_signature("top-secret", payload),
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ignored"}
    assert called is False

