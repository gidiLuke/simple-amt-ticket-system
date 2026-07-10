from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class Ticket(BaseModel):
    id: int
    number: str
    passphrase: str | None = None
    role: str | None = None
    status: str = Field(pattern="^(open|closed)$")
    created_at: datetime
    claimed_at: datetime | None = None
    closed_by: str | None = Field(default=None, pattern="^(agent|user)$")


class CreateTicketResponse(BaseModel):
    ticket: Ticket


class OpenTicketsResponse(BaseModel):
    tickets: list[Ticket]


class ClaimTicketResponse(BaseModel):
    ticket: Ticket


class TicketStatusResponse(BaseModel):
    ticket: Ticket


class TicketEstimateResponse(BaseModel):
    ticket_id: int
    people_ahead: int
    estimated_wait_minutes: int
    average_service_minutes: int


class ActiveRolesResponse(BaseModel):
    roles: list[str]

