const queryApi = new URLSearchParams(window.location.search).get("api");
const API_BASE_URL = queryApi || window.APP_CONFIG?.API_BASE_URL || "http://localhost:8000";
const AudioContextClass = window.AudioContext || window.webkitAudioContext;

const ticketsEl = document.getElementById("tickets");
const badgeEl = document.getElementById("agent-badge");
let seenTicketIds = new Set();
let audioCtx = null;

function getAudioContext() {
  if (!AudioContextClass) {
    return null;
  }

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

function unlockAudio() {
  getAudioContext();
}

window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio);

function ring() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(560, context.currentTime);
  oscillator.frequency.linearRampToValueAtTime(980, context.currentTime + 0.18);
  gain.gain.value = 0.18;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.22);
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
      ring();
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

