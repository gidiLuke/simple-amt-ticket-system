const queryApi = new URLSearchParams(window.location.search).get("api");
const API_BASE_URL = queryApi || window.APP_CONFIG?.API_BASE_URL || "http://localhost:8000";

const ticketsEl = document.getElementById("tickets");
const badgeEl = document.getElementById("agent-badge");
const imprintLinkEl = document.getElementById("imprint-link");
let seenTicketIds = new Set();

function applyImprintLink() {
  if (!imprintLinkEl) {
    return;
  }

  const configured = (window.APP_CONFIG?.IMPRINT_URL || "").trim();
  if (!configured) {
    imprintLinkEl.hidden = true;
    return;
  }

  imprintLinkEl.href = configured;
  imprintLinkEl.hidden = false;
}

function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function claimTicket(ticketId, button) {
  button.disabled = true;
  button.textContent = "Calling...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/tickets/${ticketId}/claim`, {
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Claim failed (${response.status})`);
    }

    await loadTickets();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = "Call & close";
  }
}

function renderTickets(tickets) {
  ticketsEl.innerHTML = "";

  if (tickets.length === 0) {
    ticketsEl.innerHTML = `<div class="empty">No open tickets right now. Enjoy the calm ☕</div>`;
    return;
  }

  tickets.forEach((ticket) => {
    const card = document.createElement("div");
    card.className = "ticket-card";

    const info = document.createElement("div");
    info.innerHTML = `
      <div class="ticket-number">${ticket.number}</div>
      <div class="meta">Created at ${formatTime(ticket.created_at)}</div>
    `;

    const action = document.createElement("button");
    action.textContent = "Call & close";
    action.addEventListener("click", () => claimTicket(ticket.id, action));

    card.appendChild(info);
    card.appendChild(action);
    ticketsEl.appendChild(card);
  });
}

async function loadTickets() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/tickets/open`);
    if (!response.ok) {
      throw new Error(`Queue fetch failed (${response.status})`);
    }

    const payload = await response.json();
    const tickets = payload.tickets;

    const currentIds = new Set(tickets.map((ticket) => ticket.id));
    const hasNewTicket = [...currentIds].some((id) => !seenTicketIds.has(id));

    if (hasNewTicket && seenTicketIds.size > 0) {
      badgeEl.textContent = "New ticket arrived 🔔";
    } else {
      badgeEl.textContent = `Open tickets: ${tickets.length}`;
    }

    seenTicketIds = currentIds;
    renderTickets(tickets);
  } catch (error) {
    console.error(error);
    badgeEl.textContent = "Disconnected from API. Retrying...";
  }
}

loadTickets();
window.setInterval(loadTickets, 2000);
applyImprintLink();

