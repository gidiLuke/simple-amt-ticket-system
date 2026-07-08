const queryApi = new URLSearchParams(window.location.search).get("api");
const API_BASE_URL = queryApi || window.APP_CONFIG?.API_BASE_URL || "http://localhost:8000";
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const STORAGE_KEY = "amt_active_ticket_id";
const SOUND_ENABLED_KEY = "amt_sound_enabled";
const NOTIFICATION_ENABLED_KEY = "amt_notifications_enabled";

const ticketNumberEl = document.getElementById("ticket-number");
const statusEl = document.getElementById("status");
const retryBtn = document.getElementById("retry");
const revokeBtn = document.getElementById("revoke");
const soundToggleBtn = document.getElementById("sound-toggle");
const notificationToggleBtn = document.getElementById("notification-toggle");
const imprintLinkEl = document.getElementById("imprint-link");
const estimateEl = document.getElementById("estimate");
const peopleAheadEl = document.getElementById("people-ahead");
const waitTimeEl = document.getElementById("wait-time");

let currentTicketId = null;
let hasNotified = false;
let pollIntervalId = null;
let audioCtx = null;
let soundEnabled = window.localStorage.getItem(SOUND_ENABLED_KEY) === "true";
let notificationsEnabled = window.localStorage.getItem(NOTIFICATION_ENABLED_KEY) === "true";

function supportsNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

function updateNotificationButton() {
  if (!notificationToggleBtn) {
    return;
  }

  if (!supportsNotifications()) {
    notificationToggleBtn.hidden = true;
    return;
  }

  notificationToggleBtn.hidden = false;

  if (Notification.permission === "denied") {
    notificationToggleBtn.disabled = true;
    notificationToggleBtn.textContent = "Notifications blocked";
    return;
  }

  notificationToggleBtn.disabled = false;
  notificationToggleBtn.textContent = notificationsEnabled ? "Disable notifications" : "Enable notifications";
}

async function showBrowserNotification(title, body, tag) {
  if (!supportsNotifications() || !notificationsEnabled || Notification.permission !== "granted") {
    return false;
  }

  const options = {
    body,
    tag,
    renotify: true,
  };

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, options);
        return true;
      }
    }

    new Notification(title, options);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function setNotificationsEnabled(nextState, showPreview = false) {
  if (!supportsNotifications()) {
    notificationsEnabled = false;
    updateNotificationButton();
    return;
  }

  if (!nextState) {
    notificationsEnabled = false;
    window.localStorage.setItem(NOTIFICATION_ENABLED_KEY, "false");
    updateNotificationButton();
    return;
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  notificationsEnabled = permission === "granted";
  window.localStorage.setItem(NOTIFICATION_ENABLED_KEY, String(notificationsEnabled));
  updateNotificationButton();

  if (notificationsEnabled && showPreview) {
    await showBrowserNotification("Notifications enabled", "You will now receive ticket-call notifications.", "amt-notify-enabled");
  }
}

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

  context.resume().then(() => {
    soundEnabled = context.state === "running";
    updateSoundButton();
  }).catch(() => {});
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

notificationToggleBtn?.addEventListener("click", () => {
  setNotificationsEnabled(!notificationsEnabled, !notificationsEnabled);
});

retryBtn?.addEventListener("click", () => {
  retryBtn.hidden = true;
  retryBtn.textContent = "Try again";
  createTicket();
});

revokeBtn?.addEventListener("click", () => {
  revokeTicket();
});

function saveCurrentTicketId(ticketId) {
  window.localStorage.setItem(STORAGE_KEY, String(ticketId));
}

function loadStoredTicketId() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }

  return parsed;
}

function clearStoredTicketId() {
  window.localStorage.removeItem(STORAGE_KEY);
}

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

function showEstimate(peopleAhead, estimatedWaitMinutes) {
  estimateEl.hidden = false;
  peopleAheadEl.textContent = String(peopleAhead);
  waitTimeEl.textContent = `${estimatedWaitMinutes} min`;
}

function resetEstimate() {
  estimateEl.hidden = true;
  peopleAheadEl.textContent = "-";
  waitTimeEl.textContent = "-";
}

function showRetry(message) {
  statusEl.textContent = message;
  retryBtn.disabled = false;
  retryBtn.textContent = "Get new ticket";
  retryBtn.hidden = false;
}

function resetRevokeButtonState() {
  revokeBtn.disabled = false;
  revokeBtn.textContent = "Revoke Ticket";
}

async function updateEstimate() {
  if (!currentTicketId) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/tickets/${currentTicketId}/estimate`);
    if (!response.ok) {
      throw new Error(`Estimate failed (${response.status})`);
    }

    const payload = await response.json();
    showEstimate(payload.people_ahead, payload.estimated_wait_minutes);
  } catch (error) {
    console.error(error);
  }
}

function setActiveOpenTicket(ticket) {
  currentTicketId = ticket.id;
  saveCurrentTicketId(ticket.id);
  hasNotified = false;

  ticketNumberEl.textContent = ticket.number;
  statusEl.textContent = "Ticket created. Please wait for an agent call.";
  statusEl.classList.remove("ok");
  retryBtn.hidden = true;
  resetRevokeButtonState();
  revokeBtn.hidden = false;
}

function clearActiveTicket() {
  currentTicketId = null;
  clearStoredTicketId();
  resetRevokeButtonState();
  revokeBtn.hidden = true;
  resetEstimate();
}

async function restoreTicketOrCreate() {
  const storedId = loadStoredTicketId();
  if (!storedId) {
    createTicket();
    return;
  }

  currentTicketId = storedId;
  statusEl.textContent = "Restoring your ticket...";
  retryBtn.hidden = true;
  revokeBtn.hidden = false;

  try {
    const response = await fetch(`${API_BASE_URL}/api/tickets/${storedId}`);
    if (!response.ok) {
      throw new Error(`Ticket restore failed (${response.status})`);
    }

    const payload = await response.json();
    const ticket = payload.ticket;

    if (ticket.status === "open") {
      setActiveOpenTicket(ticket);
      startPolling();
      return;
    }

    clearActiveTicket();
    ticketNumberEl.textContent = ticket.number;
    statusEl.textContent = "This ticket is already closed. You can request a new one.";
    showRetry(statusEl.textContent);
  } catch (error) {
    console.error(error);
    clearActiveTicket();
    showRetry("Could not restore previous ticket. You can request a new one.");
  }
}

async function createTicket() {
  if (currentTicketId) {
    return;
  }

  ticketNumberEl.textContent = "Creating ticket...";
  statusEl.textContent = "Contacting backend...";
  statusEl.classList.remove("ok");
  resetEstimate();
  resetRevokeButtonState();
  revokeBtn.hidden = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/tickets`, { method: "POST" });
    if (!response.ok) {
      throw new Error(`Ticket creation failed (${response.status})`);
    }

    const payload = await response.json();
    const ticket = payload.ticket;
    setActiveOpenTicket(ticket);
    updateEstimate();
    startPolling();
  } catch (error) {
    console.error(error);
    showRetry("Could not create your ticket. Please try again.");
  }
}

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
    if (payload.ticket.status === "closed") {
      if (!hasNotified && payload.ticket.closed_by === "agent") {
        hasNotified = true;
        statusEl.textContent = "Agent is ready for you now. Please head in 🎉";
        statusEl.classList.add("ok");
        const played = playChime([740, 988, 1244, 988]);
        if (!played) {
          statusEl.textContent = "Agent is ready for you now. Tap Enable sound for alerts.";
          statusEl.classList.add("ok");
        }
        if ("vibrate" in navigator) {
          navigator.vibrate([180, 80, 220]);
        }
        showBrowserNotification(
          "Your ticket is called",
          `${payload.ticket.number} is ready. Please head in now.`,
          `amt-ticket-${payload.ticket.id}`
        );
      } else if (payload.ticket.closed_by === "user") {
        statusEl.textContent = "Ticket revoked. You can request a new one.";
      }

      clearActiveTicket();
      showRetry(statusEl.textContent);
      return;
    }

    if (payload.ticket.number && ticketNumberEl.textContent !== payload.ticket.number) {
      ticketNumberEl.textContent = payload.ticket.number;
    }

    if (!hasNotified) {
      statusEl.textContent = "Ticket created. Please wait for an agent call.";
      statusEl.classList.remove("ok");
    }

    updateEstimate();
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Connection issue. Reconnecting...";
  }
}

async function revokeTicket() {
  if (!currentTicketId) {
    return;
  }

  revokeBtn.disabled = true;
  revokeBtn.textContent = "Revoking...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/tickets/${currentTicketId}/revoke`, {
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Revoke failed (${response.status})`);
    }

    clearActiveTicket();
    statusEl.textContent = "Ticket revoked. You can request a new one.";
    statusEl.classList.remove("ok");
    showRetry(statusEl.textContent);
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Could not revoke ticket right now.";
    revokeBtn.disabled = false;
    revokeBtn.textContent = "Revoke Ticket";
  }
}

function stopPolling() {
  if (pollIntervalId) {
    window.clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

function startPolling() {
  hasNotified = false;

  stopPolling();
  pollTicket();
  pollIntervalId = window.setInterval(pollTicket, 2000);
}

window.addEventListener("beforeunload", () => {
  stopPolling();
});

resetEstimate();
updateSoundButton();
updateNotificationButton();
applyImprintLink();
restoreTicketOrCreate();

