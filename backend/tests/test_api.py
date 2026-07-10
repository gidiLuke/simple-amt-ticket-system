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


def test_passphrase_scopes_open_queues(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    demo_ticket = client.post("/api/tickets").json()["ticket"]
    alpha_ticket = client.post("/api/tickets", params={"passphrase": "alpha-team"}).json()["ticket"]
    beta_ticket = client.post("/api/tickets", params={"passphrase": "beta-team"}).json()["ticket"]

    demo_queue = client.get("/api/tickets/open").json()["tickets"]
    assert [ticket["id"] for ticket in demo_queue] == [demo_ticket["id"]]

    alpha_queue = client.get("/api/tickets/open", params={"passphrase": "alpha-team"}).json()["tickets"]
    assert [ticket["id"] for ticket in alpha_queue] == [alpha_ticket["id"]]

    beta_queue = client.get("/api/tickets/open", params={"passphrase": "beta-team"}).json()["tickets"]
    assert [ticket["id"] for ticket in beta_queue] == [beta_ticket["id"]]


def test_ticket_access_requires_matching_passphrase(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    scoped_ticket = client.post("/api/tickets", params={"passphrase": "alpha-team"}).json()["ticket"]

    wrong_scope_status = client.get(f"/api/tickets/{scoped_ticket['id']}")
    assert wrong_scope_status.status_code == 404

    correct_scope_status = client.get(f"/api/tickets/{scoped_ticket['id']}", params={"passphrase": "alpha-team"})
    assert correct_scope_status.status_code == 200

    wrong_scope_claim = client.post(f"/api/tickets/{scoped_ticket['id']}/claim")
    assert wrong_scope_claim.status_code == 404

    correct_scope_claim = client.post(f"/api/tickets/{scoped_ticket['id']}/claim", params={"passphrase": "alpha-team"})
    assert correct_scope_claim.status_code == 200


def test_ticket_numbers_start_from_one_per_scope(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    demo_first = client.post("/api/tickets").json()["ticket"]
    demo_second = client.post("/api/tickets").json()["ticket"]
    scoped_first = client.post("/api/tickets", params={"passphrase": "alpha-team"}).json()["ticket"]
    scoped_second = client.post("/api/tickets", params={"passphrase": "alpha-team"}).json()["ticket"]
    other_scope_first = client.post("/api/tickets", params={"passphrase": "beta-team"}).json()["ticket"]

    assert demo_first["number"] == "A-0001"
    assert demo_second["number"] == "A-0002"
    assert scoped_first["number"] == "A-0001"
    assert scoped_second["number"] == "A-0002"
    assert other_scope_first["number"] == "A-0001"


def test_agents_see_general_plus_own_role_pool(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    general = client.post("/api/tickets").json()["ticket"]
    passport = client.post("/api/tickets", params={"role": "passport"}).json()["ticket"]
    tax = client.post("/api/tickets", params={"role": "tax"}).json()["ticket"]

    general_agent_view = client.get("/api/tickets/open").json()["tickets"]
    assert [ticket["id"] for ticket in general_agent_view] == [general["id"]]

    passport_agent_view = client.get("/api/tickets/open", params={"agent_role": "passport"}).json()["tickets"]
    assert [ticket["id"] for ticket in passport_agent_view] == [general["id"], passport["id"]]

    tax_agent_view = client.get("/api/tickets/open", params={"agent_role": "tax"}).json()["tickets"]
    assert [ticket["id"] for ticket in tax_agent_view] == [general["id"], tax["id"]]


def test_numbers_restart_per_role_pool(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    general_first = client.post("/api/tickets").json()["ticket"]
    general_second = client.post("/api/tickets").json()["ticket"]
    role_first = client.post("/api/tickets", params={"role": "passport"}).json()["ticket"]
    role_second = client.post("/api/tickets", params={"role": "passport"}).json()["ticket"]

    assert general_first["number"] == "A-0001"
    assert general_second["number"] == "A-0002"
    assert role_first["number"] == "A-0001"
    assert role_second["number"] == "A-0002"


def test_active_roles_list_from_agent_presence(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    client.post("/api/agents/presence", params={"role": "passport"})
    client.post("/api/agents/presence", params={"role": "tax"})
    client.post("/api/agents/presence", params={"role": "passport"})

    roles = client.get("/api/roles").json()["roles"]
    assert roles == ["passport", "tax"]


def test_queue_identifier_alias_works_for_scope(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    created = client.post("/api/tickets", params={"queue_identifier": "north-office"})
    assert created.status_code == 200
    ticket_id = created.json()["ticket"]["id"]

    visible = client.get("/api/tickets/open", params={"queue_identifier": "north-office"}).json()["tickets"]
    assert [ticket["id"] for ticket in visible] == [ticket_id]

    not_visible = client.get("/api/tickets/open")
    assert not_visible.status_code == 200
    assert not_visible.json()["tickets"] == []


def test_agent_can_filter_with_multiple_roles(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    general = client.post("/api/tickets").json()["ticket"]
    passport = client.post("/api/tickets", params={"role": "passport"}).json()["ticket"]
    tax = client.post("/api/tickets", params={"role": "tax"}).json()["ticket"]
    building = client.post("/api/tickets", params={"role": "building"}).json()["ticket"]

    filtered = client.get("/api/tickets/open", params={"agent_roles": "passport,tax"}).json()["tickets"]
    assert [ticket["id"] for ticket in filtered] == [general["id"], passport["id"], tax["id"]]
    assert all(ticket["id"] != building["id"] for ticket in filtered)


def test_presence_accepts_multiple_roles_csv(tmp_path: Path) -> None:
    client = build_client(tmp_path)

    client.post("/api/agents/presence", params={"roles": "passport,tax"})
    roles = client.get("/api/roles").json()["roles"]
    assert roles == ["passport", "tax"]

