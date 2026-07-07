const queryApi = new URLSearchParams(window.location.search).get("api");
const API_BASE_URL = queryApi || window.APP_CONFIG?.API_BASE_URL || "http://localhost:8000";
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const SOUND_ENABLED_KEY = "amt_sound_enabled";

const ticketsEl = document.getElementById("tickets");
const badgeEl = document.getElementById("agent-badge");
const soundToggleBtn = document.getElementById("sound-toggle");
let seenTicketIds = new Set();
let audioCtx = null;
let soundEnabled = window.localStorage.getItem(SOUND_ENABLED_KEY) === "true";

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

function updateSoundButton() {
  if (!soundToggleBtn) {
    return;
  }

  soundToggleBtn.textContent = soundEnabled ? "Disable sound" : "Enable sound";
}

async function setSoundEnabled(nextState, playPreview = false) {
  soundEnabled = nextState;
  window.localStorage.setItem(SOUND_ENABLED_KEY, String(soundEnabled));

  if (!soundEnabled) {
    updateSoundButton();
    if (audioCtx && audioCtx.state === "running") {
      audioCtx.suspend().catch(() => {});
    }
    return;
  }

  const context = getAudioContext();
  if (!context) {
    soundEnabled = false;
    window.localStorage.setItem(SOUND_ENABLED_KEY, "false");
    updateSoundButton();
    return;
  }

  try {
    await context.resume();
    soundEnabled = context.state === "running";
    window.localStorage.setItem(SOUND_ENABLED_KEY, String(soundEnabled));
    updateSoundButton();

    if (soundEnabled && playPreview) {
      playChime([740, 988, 1244]);
    }
  } catch (error) {
    console.error(error);
  }
}

function tryResumeAudio() {
  if (!soundEnabled) {
    return;
  }

  const context = getAudioContext();
  if (!context || context.state === "running") {
    return;
  }

  context.resume().catch(() => {});
}

window.addEventListener("pointerdown", tryResumeAudio, { passive: true });
window.addEventListener("keydown", tryResumeAudio);
window.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    tryResumeAudio();
  }
});

soundToggleBtn?.addEventListener("click", () => {
  setSoundEnabled(!soundEnabled, !soundEnabled);
});

function playChime(frequencies) {
  if (!soundEnabled) {
    return false;
  }

  const context = getAudioContext();
  if (!context || context.state !== "running") {
    return false;
  }

  let timeline = context.currentTime + 0.02;

  frequencies.forEach((frequency) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, timeline);
    gain.gain.setValueAtTime(0.0001, timeline);
    gain.gain.exponentialRampToValueAtTime(0.14, timeline + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, timeline + 0.36);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(timeline);
    oscillator.stop(timeline + 0.38);
    timeline += 0.18;
  });

  return true;
}

function ring() {
  playChime([740, 988, 1244, 988]);
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
updateSoundButton();

