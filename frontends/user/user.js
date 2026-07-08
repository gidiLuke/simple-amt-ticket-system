const queryApi = new URLSearchParams(window.location.search).get("api");
const API_BASE_URL = queryApi || window.APP_CONFIG?.API_BASE_URL || "http://localhost:8000";
const STORAGE_KEY = "amt_active_ticket_id";
const NOTIFICATION_ENABLED_KEY = "amt_notifications_enabled";

const ticketNumberEl = document.getElementById("ticket-number");
const statusEl = document.getElementById("status");
const retryBtn = document.getElementById("retry");
const revokeBtn = document.getElementById("revoke");
const notificationToggleEl = document.getElementById("notification-toggle");
const notificationRowEl = document.getElementById("notification-row");
const imprintLinkEl = document.getElementById("imprint-link");
const estimateEl = document.getElementById("estimate");
const peopleAheadEl = document.getElementById("people-ahead");
const waitTimeEl = document.getElementById("wait-time");

let currentTicketId = null;
let hasNotified = false;
let pollIntervalId = null;
let notificationsEnabled = window.localStorage.getItem(NOTIFICATION_ENABLED_KEY) !== "false";

function supportsNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

function updateNotificationToggle() {
  if (!notificationToggleEl) {
    return;
  }

  if (!supportsNotifications()) {
    if (notificationRowEl) {
      notificationRowEl.hidden = true;
    }
    return;
  }

  if (notificationRowEl) {
    notificationRowEl.hidden = false;
  }

  if (Notification.permission === "denied") {
    notificationsEnabled = false;
    window.localStorage.setItem(NOTIFICATION_ENABLED_KEY, "false");
    notificationToggleEl.checked = false;
    notificationToggleEl.disabled = true;
    notificationToggleEl.title = "Blocked in browser settings";
    return;
  }

  notificationToggleEl.disabled = false;
  notificationToggleEl.title = "";
  notificationToggleEl.checked = notificationsEnabled;
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
    updateNotificationToggle();
    return;
  }

  if (!nextState) {
    notificationsEnabled = false;
    window.localStorage.setItem(NOTIFICATION_ENABLED_KEY, "false");
    updateNotificationToggle();
    return;
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  notificationsEnabled = permission === "granted";
  window.localStorage.setItem(NOTIFICATION_ENABLED_KEY, String(notificationsEnabled));
  updateNotificationToggle();

  if (notificationsEnabled && showPreview) {
    await showBrowserNotification("Notifications enabled", "You will now receive ticket-call notifications.", "amt-notify-enabled");
  }
}
notificationToggleEl?.addEventListener("change", () => {
  setNotificationsEnabled(Boolean(notificationToggleEl.checked), Boolean(notificationToggleEl.checked));
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
updateNotificationToggle();
applyImprintLink();
if (notificationsEnabled && supportsNotifications() && Notification.permission === "default") {
  setNotificationsEnabled(true, false);
}
restoreTicketOrCreate();

