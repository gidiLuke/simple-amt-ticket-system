from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.deploy import DeployRunner, run_git_deploy, verify_github_signature
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


def _default_repo_dir() -> Path:
    env_value = os.getenv("GITHUB_DEPLOY_REPO_DIR")
    if env_value:
        return Path(env_value)
    return Path(__file__).resolve().parents[2]


def _wsgi_file_for_reload() -> Path | None:
    env_value = os.getenv("GITHUB_DEPLOY_WSGI_FILE")
    if not env_value:
        return None
    return Path(env_value)


def create_app(
    storage_file: Path | None = None,
    deploy_runner: DeployRunner | None = None,
) -> FastAPI:
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
    webhook_secret = os.getenv("GITHUB_WEBHOOK_SECRET")
    deploy_repo_dir = _default_repo_dir()
    deploy_remote = os.getenv("GITHUB_DEPLOY_REMOTE", "origin")
    deploy_branch = os.getenv("GITHUB_DEPLOY_BRANCH", "main")
    deploy_ref = os.getenv("GITHUB_DEPLOY_REF", f"refs/heads/{deploy_branch}")
    deploy_wsgi_file = _wsgi_file_for_reload()
    effective_deploy_runner = deploy_runner or run_git_deploy

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

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

    @app.post("/api/deploy/github")
    async def github_deploy_webhook(request: Request) -> dict[str, str]:
        if not webhook_secret:
            raise HTTPException(status_code=404, detail="Not found")

        payload = await request.body()
        signature = request.headers.get("X-Hub-Signature-256")
        if not verify_github_signature(webhook_secret, payload, signature):
            raise HTTPException(status_code=401, detail="Invalid signature")

        event = request.headers.get("X-GitHub-Event", "")
        if event == "ping":
            return {"status": "ok"}
        if event != "push":
            return {"status": "ignored"}

        try:
            body = json.loads(payload.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc

        if body.get("ref") != deploy_ref:
            return {"status": "ignored"}

        try:
            effective_deploy_runner(
                deploy_repo_dir,
                deploy_remote,
                deploy_branch,
                deploy_wsgi_file,
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail="Deployment failed") from exc

        return {"status": "updated"}

    return app


app = create_app()

