from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class Ticket(BaseModel):
    id: int
    number: str
    status: str = Field(pattern="^(open|closed)$")
    created_at: datetime
    claimed_at: datetime | None = None


class CreateTicketResponse(BaseModel):
    ticket: Ticket


class OpenTicketsResponse(BaseModel):
    tickets: list[Ticket]


class ClaimTicketResponse(BaseModel):
    ticket: Ticket


class TicketStatusResponse(BaseModel):
    ticket: Ticket

