from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from app.models import Ticket


class TicketStore:
    def __init__(self, storage_file: Path | None = None) -> None:
        self._lock = Lock()
        self._tickets: dict[int, Ticket] = {}
        self._next_id = 1
        self._storage_file = storage_file
        self._load()

    def create_ticket(self) -> Ticket:
        with self._lock:
            ticket_id = self._next_id
            ticket = Ticket(
                id=ticket_id,
                number=self._format_number(ticket_id),
                status="open",
                created_at=datetime.now(timezone.utc),
            )
            self._tickets[ticket_id] = ticket
            self._next_id += 1
            self._save()
            return ticket

    def list_open_tickets(self) -> list[Ticket]:
        with self._lock:
            return sorted(
                [ticket for ticket in self._tickets.values() if ticket.status == "open"],
                key=lambda ticket: ticket.id,
            )

    def claim_ticket(self, ticket_id: int) -> Ticket:
        with self._lock:
            if ticket_id not in self._tickets:
                raise KeyError(ticket_id)

            ticket = self._tickets[ticket_id]
            if ticket.status == "closed":
                return ticket

            updated = ticket.model_copy(
                update={
                    "status": "closed",
                    "claimed_at": datetime.now(timezone.utc),
                }
            )
            self._tickets[ticket_id] = updated
            self._save()
            return updated

    def get_ticket(self, ticket_id: int) -> Ticket:
        with self._lock:
            if ticket_id not in self._tickets:
                raise KeyError(ticket_id)
            return self._tickets[ticket_id]

    def _load(self) -> None:
        if self._storage_file is None or not self._storage_file.exists():
            return

        data = json.loads(self._storage_file.read_text(encoding="utf-8"))
        self._next_id = data.get("next_id", 1)
        ticket_rows = data.get("tickets", [])
        self._tickets = {row["id"]: Ticket.model_validate(row) for row in ticket_rows}

    def _save(self) -> None:
        if self._storage_file is None:
            return

        self._storage_file.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "next_id": self._next_id,
            "tickets": [ticket.model_dump(mode="json") for ticket in self._tickets.values()],
        }
        self._storage_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    @staticmethod
    def _format_number(ticket_id: int) -> str:
        return f"A-{ticket_id:04d}"

