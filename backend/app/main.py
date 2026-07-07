from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.models import (
    ClaimTicketResponse,
    CreateTicketResponse,
    OpenTicketsResponse,
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

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": app.version}

    @app.post("/api/tickets", response_model=CreateTicketResponse)
    def create_ticket() -> CreateTicketResponse:
        ticket = store.create_ticket()
        return CreateTicketResponse(ticket=ticket)

    @app.get("/api/tickets/open", response_model=OpenTicketsResponse)
    def open_tickets() -> OpenTicketsResponse:
        return OpenTicketsResponse(tickets=store.list_open_tickets())

    @app.post("/api/tickets/{ticket_id}/claim", response_model=ClaimTicketResponse)
    def claim_ticket(ticket_id: int) -> ClaimTicketResponse:
        try:
            ticket = store.claim_ticket(ticket_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Ticket not found") from exc
        return ClaimTicketResponse(ticket=ticket)

    @app.get("/api/tickets/{ticket_id}", response_model=TicketStatusResponse)
    def ticket_status(ticket_id: int) -> TicketStatusResponse:
        try:
            ticket = store.get_ticket(ticket_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Ticket not found") from exc
        return TicketStatusResponse(ticket=ticket)

    @app.get("/")
    def root() -> dict[str, str]:
        return {"message": "Simple AMT Ticket System API is running"}

    return app


app = create_app()

