const queryApi = new URLSearchParams(window.location.search).get("api");
const API_BASE_URL = queryApi || window.APP_CONFIG?.API_BASE_URL || "http://localhost:8000";

const ticketNumberEl = document.getElementById("ticket-number");
const statusEl = document.getElementById("status");
const retryBtn = document.getElementById("retry");

let currentTicketId = null;
let hasNotified = false;

retryBtn?.addEventListener("click", () => {
  retryBtn.hidden = true;
  createTicket();
});

async function createTicket() {
  ticketNumberEl.textContent = "Creating ticket...";
  statusEl.textContent = "Contacting backend...";
  statusEl.classList.remove("ok");

  try {
    const response = await fetch(`${API_BASE_URL}/api/tickets`, { method: "POST" });
    if (!response.ok) {
      throw new Error(`Ticket creation failed (${response.status})`);
    }

    const payload = await response.json();
    const ticket = payload.ticket;
    currentTicketId = ticket.id;

    ticketNumberEl.textContent = ticket.number;
    statusEl.textContent = "Ticket created. Please wait for an agent call.";
    startPolling();
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Could not create your ticket. Please try again.";
    retryBtn.hidden = false;
  }
}

function beep(pattern = [220, 150, 280]) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  let timeline = audioCtx.currentTime;

  pattern.forEach((duration) => {
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.18;
    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.start(timeline);
    oscillator.stop(timeline + duration / 1000);
    timeline += duration / 1000 + 0.04;
  });
}

async function pollTicket() {
  if (!currentTicketId) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/tickets/${currentTicketId}`);
    if (!response.ok) {
      throw new Error(`Status poll failed (${response.status})`);
    }

    const payload = await response.json();
    if (payload.ticket.status === "closed" && !hasNotified) {
      hasNotified = true;
      statusEl.textContent = "Agent is ready for you now. Please head in 🎉";
      statusEl.classList.add("ok");
      beep();
      if ("vibrate" in navigator) {
        navigator.vibrate([180, 80, 220]);
      }
    }
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Connection issue. Reconnecting...";
  }
}

function startPolling() {
  hasNotified = false;
  pollTicket();
  window.setInterval(pollTicket, 2000);
}

createTicket();

