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

    def create_ticket(self, passphrase: str | None = None) -> Ticket:
        normalized_passphrase = self._normalize_passphrase(passphrase)
        with self._lock:
            ticket_id = self._next_id
            scoped_number = self._next_number_for_scope(normalized_passphrase)
            ticket = Ticket(
                id=ticket_id,
                number=self._format_number(scoped_number),
                passphrase=normalized_passphrase,
                status="open",
                created_at=datetime.now(timezone.utc),
            )
            self._tickets[ticket_id] = ticket
            self._next_id += 1
            self._save()
            return ticket

    def list_open_tickets(self, passphrase: str | None = None) -> list[Ticket]:
        normalized_passphrase = self._normalize_passphrase(passphrase)
        with self._lock:
            return sorted(
                [
                    ticket
                    for ticket in self._tickets.values()
                    if ticket.status == "open" and self._matches_scope(ticket, normalized_passphrase)
                ],
                key=lambda ticket: ticket.id,
            )

    def claim_ticket(self, ticket_id: int, passphrase: str | None = None) -> Ticket:
        normalized_passphrase = self._normalize_passphrase(passphrase)
        with self._lock:
            if ticket_id not in self._tickets:
                raise KeyError(ticket_id)

            ticket = self._tickets[ticket_id]
            if not self._matches_scope(ticket, normalized_passphrase):
                raise KeyError(ticket_id)

            if ticket.status == "closed":
                return ticket

            updated = ticket.model_copy(
                update={
                    "status": "closed",
                    "claimed_at": datetime.now(timezone.utc),
                    "closed_by": "agent",
                }
            )
            self._tickets[ticket_id] = updated
            self._save()
            return updated

    def revoke_ticket(self, ticket_id: int, passphrase: str | None = None) -> Ticket:
        normalized_passphrase = self._normalize_passphrase(passphrase)
        with self._lock:
            if ticket_id not in self._tickets:
                raise KeyError(ticket_id)

            ticket = self._tickets[ticket_id]
            if not self._matches_scope(ticket, normalized_passphrase):
                raise KeyError(ticket_id)

            if ticket.status == "closed":
                return ticket

            updated = ticket.model_copy(
                update={
                    "status": "closed",
                    "claimed_at": datetime.now(timezone.utc),
                    "closed_by": "user",
                }
            )
            self._tickets[ticket_id] = updated
            self._save()
            return updated

    def estimate_for_ticket(self, ticket_id: int, passphrase: str | None = None) -> tuple[int, int, int]:
        normalized_passphrase = self._normalize_passphrase(passphrase)
        with self._lock:
            if ticket_id not in self._tickets:
                raise KeyError(ticket_id)

            ticket = self._tickets[ticket_id]
            if not self._matches_scope(ticket, normalized_passphrase):
                raise KeyError(ticket_id)

            if ticket.status == "closed":
                return (0, 0, self._default_service_minutes())

            open_tickets = sorted(
                [
                    item
                    for item in self._tickets.values()
                    if item.status == "open" and self._matches_scope(item, normalized_passphrase)
                ],
                key=lambda item: item.id,
            )
            people_ahead = len([item for item in open_tickets if item.id < ticket_id])

            average_service_minutes = self._average_service_minutes()
            estimated_wait_minutes = people_ahead * average_service_minutes
            return (people_ahead, estimated_wait_minutes, average_service_minutes)

    def get_ticket(self, ticket_id: int, passphrase: str | None = None) -> Ticket:
        normalized_passphrase = self._normalize_passphrase(passphrase)
        with self._lock:
            if ticket_id not in self._tickets:
                raise KeyError(ticket_id)
            ticket = self._tickets[ticket_id]
            if not self._matches_scope(ticket, normalized_passphrase):
                raise KeyError(ticket_id)
            return ticket

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

    @staticmethod
    def _default_service_minutes() -> int:
        return 3

    def _average_service_minutes(self) -> int:
        closed_durations_minutes: list[int] = []
        for ticket in self._tickets.values():
            if ticket.claimed_at is None:
                continue

            duration_seconds = (ticket.claimed_at - ticket.created_at).total_seconds()
            if duration_seconds <= 0:
                continue

            closed_durations_minutes.append(max(1, round(duration_seconds / 60)))

        if not closed_durations_minutes:
            return self._default_service_minutes()

        return max(1, round(sum(closed_durations_minutes) / len(closed_durations_minutes)))

    def _next_number_for_scope(self, passphrase: str | None) -> int:
        in_scope = [ticket for ticket in self._tickets.values() if ticket.passphrase == passphrase]
        return len(in_scope) + 1

    @staticmethod
    def _normalize_passphrase(passphrase: str | None) -> str | None:
        if passphrase is None:
            return None
        normalized = passphrase.strip().lower()
        if not normalized:
            return None
        return normalized

    @staticmethod
    def _matches_scope(ticket: Ticket, passphrase: str | None) -> bool:
        return ticket.passphrase == passphrase

