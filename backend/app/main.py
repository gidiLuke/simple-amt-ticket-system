from __future__ import annotations

import os
from pathlib import Path
from threading import Lock
from time import monotonic

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.models import (
    ActiveRolesResponse,
    ClaimTicketResponse,
    CreateTicketResponse,
    OpenTicketsResponse,
    TicketEstimateResponse,
    TicketStatusResponse,
)
from app.store import TicketStore


def _default_storage_file() -> Path:
    env_value = os.getenv("TICKET_STORE_FILE")
    if env_value:
        return Path(env_value)
    return Path(__file__).resolve().parents[1] / "data" / "tickets.json"


def _frontend_origins() -> list[str]:
    raw = os.getenv("FRONTEND_ORIGINS", "*")
    if raw.strip() == "*":
        return ["*"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app(storage_file: Path | None = None) -> FastAPI:
    app = FastAPI(title="Simple AMT Ticket System API", version="1.0.0")
    origins = _frontend_origins()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    store = TicketStore(storage_file=storage_file or _default_storage_file())
    active_roles: dict[tuple[str | None, str], float] = {}
    roles_lock = Lock()
    roles_ttl_seconds = 45.0

    def normalize_role(role: str | None) -> str | None:
        if role is None:
            return None
        normalized = role.strip().lower()
        if not normalized:
            return None
        return normalized

    def normalize_passphrase(passphrase: str | None) -> str | None:
        if passphrase is None:
            return None
        normalized = passphrase.strip().lower()
        if not normalized:
            return None
        return normalized

    def cleanup_roles(now_value: float) -> None:
        stale = [key for key, seen_at in active_roles.items() if now_value - seen_at > roles_ttl_seconds]
        for key in stale:
            del active_roles[key]

    def register_presence(passphrase: str | None, role: str | None) -> None:
        normalized_role = normalize_role(role)
        if normalized_role is None:
            return
        normalized_passphrase = normalize_passphrase(passphrase)
        now_value = monotonic()
        with roles_lock:
            cleanup_roles(now_value)
            active_roles[(normalized_passphrase, normalized_role)] = now_value

    def list_roles(passphrase: str | None) -> list[str]:
        normalized_passphrase = normalize_passphrase(passphrase)
        now_value = monotonic()
        with roles_lock:
            cleanup_roles(now_value)
            return sorted(
                role
                for (scope, role), _seen_at in active_roles.items()
                if scope == normalized_passphrase
            )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": app.version}

    @app.post("/api/tickets", response_model=CreateTicketResponse)
    def create_ticket(
        passphrase: str | None = Query(default=None),
        role: str | None = Query(default=None),
    ) -> CreateTicketResponse:
        ticket = store.create_ticket(passphrase=passphrase, role=role)
        return CreateTicketResponse(ticket=ticket)

    @app.get("/api/tickets/open", response_model=OpenTicketsResponse)
    def open_tickets(
        passphrase: str | None = Query(default=None),
        agent_role: str | None = Query(default=None),
    ) -> OpenTicketsResponse:
        return OpenTicketsResponse(tickets=store.list_open_tickets(passphrase=passphrase, agent_role=agent_role))

    @app.post("/api/agents/presence")
    def agent_presence(
        passphrase: str | None = Query(default=None),
        role: str | None = Query(default=None),
    ) -> dict[str, str]:
        register_presence(passphrase=passphrase, role=role)
        return {"status": "ok"}

    @app.get("/api/roles", response_model=ActiveRolesResponse)
    def roles(passphrase: str | None = Query(default=None)) -> ActiveRolesResponse:
        return ActiveRolesResponse(roles=list_roles(passphrase=passphrase))

    @app.post("/api/tickets/{ticket_id}/claim", response_model=ClaimTicketResponse)
    def claim_ticket(ticket_id: int, passphrase: str | None = Query(default=None)) -> ClaimTicketResponse:
        try:
            ticket = store.claim_ticket(ticket_id, passphrase=passphrase)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Ticket not found") from exc
        return ClaimTicketResponse(ticket=ticket)

    @app.post("/api/tickets/{ticket_id}/revoke", response_model=ClaimTicketResponse)
    def revoke_ticket(ticket_id: int, passphrase: str | None = Query(default=None)) -> ClaimTicketResponse:
        try:
            ticket = store.revoke_ticket(ticket_id, passphrase=passphrase)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Ticket not found") from exc
        return ClaimTicketResponse(ticket=ticket)

    @app.get("/api/tickets/{ticket_id}", response_model=TicketStatusResponse)
    def ticket_status(ticket_id: int, passphrase: str | None = Query(default=None)) -> TicketStatusResponse:
        try:
            ticket = store.get_ticket(ticket_id, passphrase=passphrase)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Ticket not found") from exc
        return TicketStatusResponse(ticket=ticket)

    @app.get("/api/tickets/{ticket_id}/estimate", response_model=TicketEstimateResponse)
    def ticket_estimate(ticket_id: int, passphrase: str | None = Query(default=None)) -> TicketEstimateResponse:
        try:
            people_ahead, estimated_wait_minutes, average_service_minutes = store.estimate_for_ticket(
                ticket_id,
                passphrase=passphrase,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Ticket not found") from exc

        return TicketEstimateResponse(
            ticket_id=ticket_id,
            people_ahead=people_ahead,
            estimated_wait_minutes=estimated_wait_minutes,
            average_service_minutes=average_service_minutes,
        )

    @app.get("/")
    def root() -> dict[str, str]:
        return {"message": "Simple AMT Ticket System API is running"}

    return app


app = create_app()

