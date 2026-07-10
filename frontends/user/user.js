const queryParams = new URLSearchParams(window.location.search);
const queryApi = queryParams.get("api");
const queryQueueIdentifier = queryParams.get("queue_identifier") || queryParams.get("passphrase");
const API_BASE_URL = queryApi || window.APP_CONFIG?.API_BASE_URL || "http://localhost:8000";
const NOTIFICATION_ENABLED_KEY = "amt_notifications_enabled";
const QUEUE_IDENTIFIER = normalizePassphrase(queryQueueIdentifier);
const STORAGE_KEY = `amt_active_ticket_id:${QUEUE_IDENTIFIER || "demo"}`;

const ticketNumberEl = document.getElementById("ticket-number");
const statusEl = document.getElementById("status");
const retryBtn = document.getElementById("retry");
const revokeBtn = document.getElementById("revoke");
const notificationToggleEl = document.getElementById("notification-toggle");
const imprintLinkEl = document.getElementById("imprint-link");
const estimateEl = document.getElementById("estimate");
const peopleAheadEl = document.getElementById("people-ahead");
const waitTimeEl = document.getElementById("wait-time");
const callAlertEl = document.getElementById("call-alert");
const callAlertDismissEl = document.getElementById("call-alert-dismiss");
const rolePanelEl = document.getElementById("role-panel");
const roleButtonsEl = document.getElementById("role-buttons");
const refreshRolesEl = document.getElementById("refresh-roles");
const selectionScreenEl = document.getElementById("selection-screen");
const ticketScreenEl = document.getElementById("ticket-screen");
const PAGE_TITLE_DEFAULT = document.title;

let currentTicketId = null;
let hasNotified = false;
let pollIntervalId = null;
let titleAlertIntervalId = null;
let fallbackAlertIntervalId = null;
let notificationsEnabled = window.localStorage.getItem(NOTIFICATION_ENABLED_KEY) !== "false";
let rolesPollIntervalId = null;
let selectedRole = null;

function normalizePassphrase(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function buildApiUrl(path) {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (QUEUE_IDENTIFIER) {
    url.searchParams.set("queue_identifier", QUEUE_IDENTIFIER);
  }
  return url.toString();
}

function buildRoleAwareApiUrl(path, role) {
  const url = new URL(buildApiUrl(path));
  if (role) {
    url.searchParams.set("role", role);
  }
  return url.toString();
}

function toggleRolePanel(visible) {
  if (!rolePanelEl) {
    return;
  }
  rolePanelEl.hidden = !visible;
}

function toggleTicketScreen(visible) {
  if (!ticketScreenEl) {
    return;
  }
  ticketScreenEl.hidden = !visible;
}

function setScreenMode(mode) {
  const isSelection = mode === "selection";
  if (selectionScreenEl) {
    selectionScreenEl.hidden = !isSelection;
  }
  toggleRolePanel(isSelection);
  toggleTicketScreen(!isSelection);

  if (isSelection) {
    startRolesPolling();
  } else {
    stopRolesPolling();
  }
}

async function loadRoles() {
  if (!roleButtonsEl) {
    return;
  }

  try {
    const response = await fetch(buildApiUrl("/api/roles"));
    if (!response.ok) {
      throw new Error(`Role fetch failed (${response.status})`);
    }

    const payload = await response.json();
    const roles = Array.isArray(payload.roles)
      ? payload.roles
        .map((role) => normalizePassphrase(String(role)))
        .filter((role, index, arr) => role && arr.indexOf(role) === index)
      : [];

    roleButtonsEl.innerHTML = "";

    const pools = [{ role: null, title: "General pool", subtitle: "Visible to all agents" }]
      .concat(roles.map((role) => ({ role, title: role, subtitle: "Role-specific queue" })));

    pools.forEach((pool) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "role-option-btn";
      button.innerHTML = `<span>${pool.title}</span><span class=\"meta\">${pool.subtitle}</span>`;
      button.addEventListener("click", () => createTicket(pool.role));
      roleButtonsEl.appendChild(button);
    });
  } catch (error) {
    console.error(error);
  }
}

function setCalledAttention(active) {
  document.body.classList.toggle("ticket-called-active", active);
}

function startRolesPolling() {
  if (rolesPollIntervalId) {
    window.clearInterval(rolesPollIntervalId);
  }

  loadRoles();
  rolesPollIntervalId = window.setInterval(loadRoles, 10000);
}

function stopRolesPolling() {
  if (!rolesPollIntervalId) {
    return;
  }
  window.clearInterval(rolesPollIntervalId);
  rolesPollIntervalId = null;
}

function showRoleSelectionPrompt() {
  ticketNumberEl.textContent = "No ticket yet";
  statusEl.textContent = "Please choose a role and request a ticket.";
  retryBtn.hidden = true;
  resetRevokeButtonState();
  revokeBtn.hidden = true;
  resetEstimate();
  setScreenMode("selection");
}

function supportsNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

function updateNotificationToggle() {
  if (!notificationToggleEl) {
    return;
  }

  if (!supportsNotifications()) {
    notificationToggleEl.hidden = true;
    return;
  }

  notificationToggleEl.hidden = false;

  if (Notification.permission === "denied") {
    notificationsEnabled = false;
    window.localStorage.setItem(NOTIFICATION_ENABLED_KEY, "false");
    notificationToggleEl.disabled = true;
    notificationToggleEl.title = "Blocked in browser settings";
    notificationToggleEl.textContent = "Alerts unavailable";
    notificationToggleEl.setAttribute("aria-pressed", "false");
    return;
  }

  notificationToggleEl.disabled = false;
  notificationToggleEl.title = "";
  notificationToggleEl.textContent = notificationsEnabled ? "Alerts on" : "Alerts off";
  notificationToggleEl.setAttribute("aria-pressed", String(notificationsEnabled));
}

async function showBrowserNotification(title, body, tag) {
  if (!supportsNotifications() || !notificationsEnabled || Notification.permission !== "granted") {
    return false;
  }

  const options = {
    body,
    tag,
    renotify: true,
    requireInteraction: true,
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

function startTitleAlert(ticketNumber) {
  if (titleAlertIntervalId) {
    return;
  }

  const calledTitle = `${ticketNumber} called - please enter`;
  let showCalledTitle = true;
  document.title = calledTitle;

  titleAlertIntervalId = window.setInterval(() => {
    document.title = showCalledTitle ? calledTitle : PAGE_TITLE_DEFAULT;
    showCalledTitle = !showCalledTitle;
  }, 1200);
}

function stopTitleAlert() {
  if (!titleAlertIntervalId) {
    document.title = PAGE_TITLE_DEFAULT;
    return;
  }

  window.clearInterval(titleAlertIntervalId);
  titleAlertIntervalId = null;
  document.title = PAGE_TITLE_DEFAULT;
}

function playAlertTone() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return;
    }

    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const first = ctx.createOscillator();
    const second = ctx.createOscillator();
    const gain = ctx.createGain();

    first.type = "sine";
    first.frequency.value = 880;
    second.type = "sine";
    second.frequency.value = 1175;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    first.connect(gain);
    second.connect(gain);
    gain.connect(ctx.destination);

    first.start(now);
    second.start(now + 0.25);
    first.stop(now + 0.35);
    second.stop(now + 0.6);
  } catch (error) {
    console.error(error);
  }
}

function startFallbackAlertLoop() {
  if (fallbackAlertIntervalId) {
    return;
  }

  fallbackAlertIntervalId = window.setInterval(() => {
    playAlertTone();
    if ("vibrate" in navigator) {
      navigator.vibrate([140, 70, 180]);
    }
  }, 3200);
}

function stopFallbackAlertLoop() {
  if (!fallbackAlertIntervalId) {
    return;
  }

  window.clearInterval(fallbackAlertIntervalId);
  fallbackAlertIntervalId = null;
}

function showCalledBanner(ticketNumber) {
  if (!callAlertEl) {
    return;
  }

  const titleEl = callAlertEl.querySelector(".call-alert-title");
  if (titleEl) {
    titleEl.textContent = `Now serving ${ticketNumber}`;
  }
  callAlertEl.hidden = false;
}

function hideCalledBanner() {
  if (!callAlertEl) {
    return;
  }
  callAlertEl.hidden = true;
}

async function triggerTicketCalledAlert(ticket) {
  setCalledAttention(true);
  startTitleAlert(ticket.number);
  showCalledBanner(ticket.number);
  startFallbackAlertLoop();

  if ("vibrate" in navigator) {
    navigator.vibrate([180, 80, 220, 120, 250]);
  }

  playAlertTone();

  const notificationSent = await showBrowserNotification(
    "Your ticket is called",
    `${ticket.number} is ready. Please head in now.`,
    `amt-ticket-${ticket.id}`
  );

  if (!notificationSent && notificationToggleEl && notificationsEnabled) {
    notificationToggleEl.textContent = "Alerts limited";
    notificationToggleEl.title = "System notifications are limited on this browser. Keep this page visible for in-page alerts.";
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
notificationToggleEl?.addEventListener("click", () => {
  const nextState = !notificationsEnabled;
  setNotificationsEnabled(nextState, nextState);
});

retryBtn?.addEventListener("click", () => {
  retryBtn.hidden = true;
  retryBtn.textContent = "Try again";
  showRoleSelectionPrompt();
});

refreshRolesEl?.addEventListener("click", () => {
  loadRoles();
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
    const response = await fetch(buildApiUrl(`/api/tickets/${currentTicketId}/estimate`));
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

  setScreenMode("ticket");

  ticketNumberEl.textContent = ticket.number;
  statusEl.textContent = "Your ticket is active. We will call you shortly.";
  statusEl.classList.remove("ok");
  retryBtn.hidden = true;
  resetRevokeButtonState();
  revokeBtn.hidden = false;
}

function clearActiveTicket(options = {}) {
  const returnToSelection = Boolean(options.returnToSelection);
  const keepCalledVisual = Boolean(options.keepCalledVisual);

  currentTicketId = null;
  clearStoredTicketId();
  resetRevokeButtonState();
  revokeBtn.hidden = true;
  resetEstimate();

  if (!keepCalledVisual) {
    hideCalledBanner();
    setCalledAttention(false);
    stopFallbackAlertLoop();
    stopTitleAlert();
  }

  selectedRole = null;

  if (returnToSelection) {
    showRoleSelectionPrompt();
  } else {
    setScreenMode("ticket");
  }
}

async function restoreTicketOrCreate() {
  const storedId = loadStoredTicketId();
  if (!storedId) {
    showRoleSelectionPrompt();
    return;
  }

  setScreenMode("ticket");
  currentTicketId = storedId;
  statusEl.textContent = "Restoring your ticket...";
  retryBtn.hidden = true;
  revokeBtn.hidden = false;

  try {
    const response = await fetch(buildApiUrl(`/api/tickets/${storedId}`));
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

    clearActiveTicket({ returnToSelection: true });
    ticketNumberEl.textContent = ticket.number;
    statusEl.textContent = "This ticket has already been closed. You can request a new one.";
    showRetry(statusEl.textContent);
  } catch (error) {
    console.error(error);
    clearActiveTicket({ returnToSelection: true });
    showRetry("Could not restore previous ticket. You can request a new one.");
  }
}

async function createTicket(forcedRole = null) {
  if (currentTicketId) {
    return;
  }

  selectedRole = forcedRole;

  ticketNumberEl.textContent = "Creating ticket...";
  statusEl.textContent = "Connecting to the queue service...";
  statusEl.classList.remove("ok");
  resetEstimate();
  resetRevokeButtonState();
  revokeBtn.hidden = true;

  try {
    const response = await fetch(buildRoleAwareApiUrl("/api/tickets", selectedRole), { method: "POST" });
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
    const response = await fetch(buildApiUrl(`/api/tickets/${currentTicketId}`));
    if (!response.ok) {
      throw new Error(`Status poll failed (${response.status})`);
    }

    const payload = await response.json();
    if (payload.ticket.status === "closed") {
      if (!hasNotified && payload.ticket.closed_by === "agent") {
        hasNotified = true;
        statusEl.textContent = "Your ticket has been called. Please head to the desk now.";
        statusEl.classList.add("ok");
        await triggerTicketCalledAlert(payload.ticket);
        clearActiveTicket({ returnToSelection: false, keepCalledVisual: true });
        return;
      } else if (payload.ticket.closed_by === "user") {
        statusEl.textContent = "Ticket revoked. You can request a new one.";
        hideCalledBanner();
        setCalledAttention(false);
        stopFallbackAlertLoop();
        stopTitleAlert();
        clearActiveTicket({ returnToSelection: true });
        return;
      }

      clearActiveTicket({ returnToSelection: false });
      return;
    }

    if (payload.ticket.number && ticketNumberEl.textContent !== payload.ticket.number) {
      ticketNumberEl.textContent = payload.ticket.number;
    }

    if (!hasNotified) {
      statusEl.textContent = "Your ticket is active. We will call you shortly.";
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
    const response = await fetch(buildApiUrl(`/api/tickets/${currentTicketId}/revoke`), {
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`Revoke failed (${response.status})`);
    }

    clearActiveTicket({ returnToSelection: true });
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
  stopRolesPolling();
  stopFallbackAlertLoop();
  stopTitleAlert();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && currentTicketId) {
    pollTicket();
  }
  if (document.visibilityState === "visible" && !currentTicketId) {
    loadRoles();
  }
});

callAlertDismissEl?.addEventListener("click", () => {
  hideCalledBanner();
  setCalledAttention(false);
  stopFallbackAlertLoop();
  stopTitleAlert();
});

resetEstimate();
updateNotificationToggle();
applyImprintLink();
if (notificationsEnabled && supportsNotifications() && Notification.permission === "default") {
  setNotificationsEnabled(true, false);
}
restoreTicketOrCreate();

