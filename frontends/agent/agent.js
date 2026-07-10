const queryApi = new URLSearchParams(window.location.search).get("api");
const API_BASE_URL = queryApi || window.APP_CONFIG?.API_BASE_URL || "http://localhost:8000";
const NOTIFICATION_ENABLED_KEY = "amt_agent_notifications_enabled";
const PASSPHRASE_STORAGE_KEY = "amt_agent_passphrase";
const ROLE_STORAGE_PREFIX = "amt_agent_role";

const ticketsEl = document.getElementById("tickets");
const badgeEl = document.getElementById("agent-badge");
const notificationToggleEl = document.getElementById("notification-toggle");
const settingsToggleEl = document.getElementById("settings-toggle");
const settingsPanelEl = document.getElementById("settings-panel");
const queueModeHintEl = document.getElementById("queue-mode-hint");
const passphraseInputEl = document.getElementById("passphrase-input");
const generatePassphraseEl = document.getElementById("generate-passphrase");
const applyPassphraseEl = document.getElementById("apply-passphrase");
const clearPassphraseEl = document.getElementById("clear-passphrase");
const roleInputEl = document.getElementById("role-input");
const applyRoleEl = document.getElementById("apply-role");
const clearRoleEl = document.getElementById("clear-role");
const userQrImageEl = document.getElementById("user-qr");
const userLinkEl = document.getElementById("user-link");
const downloadQrEl = document.getElementById("download-qr");
const imprintLinkEl = document.getElementById("imprint-link");
let seenTicketIds = new Set();
let notificationsEnabled = window.localStorage.getItem(NOTIFICATION_ENABLED_KEY) !== "false";
let activePassphrase = normalizePassphrase(new URLSearchParams(window.location.search).get("passphrase")) ||
  normalizePassphrase(window.localStorage.getItem(PASSPHRASE_STORAGE_KEY));
let presenceIntervalId = null;
let activeRole = normalizeRole(window.localStorage.getItem(roleStorageKey(activePassphrase)));

function normalizePassphrase(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-\s]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
  return normalized || null;
}

function normalizeRole(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function roleStorageKey(passphrase) {
  return `${ROLE_STORAGE_PREFIX}:${passphrase || "demo"}`;
}

function buildApiUrl(path, extraParams = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (activePassphrase) {
    url.searchParams.set("passphrase", activePassphrase);
  }
  Object.entries(extraParams).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function suggestedUserLink() {
  const current = new URL(window.location.href);
  const userPath = current.pathname.replace(/\/agent\/[^/]*$/, "/user/");
  const userUrl = new URL(userPath, current.origin);

  if (queryApi) {
    userUrl.searchParams.set("api", queryApi);
  }
  if (activePassphrase) {
    userUrl.searchParams.set("passphrase", activePassphrase);
  }

  return userUrl.toString();
}

function buildQrImageUrl(link) {
  const qrUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
  qrUrl.searchParams.set("size", "220x220");
  qrUrl.searchParams.set("margin", "10");
  qrUrl.searchParams.set("format", "png");
  qrUrl.searchParams.set("data", link);
  return qrUrl.toString();
}

function makeRandomPassphrase() {
  const wordsA = ["amber", "brisk", "civic", "delta", "eager", "fancy", "gentle", "harbor", "ivory", "jolly"];
  const wordsB = ["otter", "lantern", "meadow", "signal", "paper", "rocket", "ticket", "window", "forest", "piano"];
  const wordsC = ["bridge", "sheriff", "station", "pocket", "beacon", "ledger", "avenue", "village", "harbor", "office"];

  const pick = (collection) => collection[Math.floor(Math.random() * collection.length)];
  return `${pick(wordsA)}-${pick(wordsB)}-${pick(wordsC)}`;
}

function updateQueueModeLabel() {
  if (!queueModeHintEl) {
    return;
  }

  const queueText = activePassphrase
    ? `Queue scope: ${activePassphrase}`
    : "Queue scope: demo";
  const roleText = activeRole
    ? `Agent role: ${activeRole} (sees general + ${activeRole})`
    : "Agent role: general pool only";
  queueModeHintEl.textContent = `${queueText} | ${roleText}`;
}

async function renderUserQr() {
  if (!userQrImageEl || !userLinkEl) {
    return;
  }

  const link = suggestedUserLink();
  const qrImageUrl = buildQrImageUrl(link);
  userLinkEl.textContent = link;
  userLinkEl.href = link;
  userQrImageEl.src = qrImageUrl;
}

function applyPassphrase(nextValue) {
  activePassphrase = normalizePassphrase(nextValue);
  if (activePassphrase) {
    window.localStorage.setItem(PASSPHRASE_STORAGE_KEY, activePassphrase);
  } else {
    window.localStorage.removeItem(PASSPHRASE_STORAGE_KEY);
  }

  if (passphraseInputEl) {
    passphraseInputEl.value = activePassphrase || "";
  }

  activeRole = normalizeRole(window.localStorage.getItem(roleStorageKey(activePassphrase)));
  if (roleInputEl) {
    roleInputEl.value = activeRole || "";
  }

  updateQueueModeLabel();
  renderUserQr();
  registerPresence();
  seenTicketIds = new Set();
  loadTickets();
}

function applyRole(nextValue) {
  activeRole = normalizeRole(nextValue);

  if (activeRole) {
    window.localStorage.setItem(roleStorageKey(activePassphrase), activeRole);
  } else {
    window.localStorage.removeItem(roleStorageKey(activePassphrase));
  }

  if (roleInputEl) {
    roleInputEl.value = activeRole || "";
  }

  updateQueueModeLabel();
  registerPresence();
  seenTicketIds = new Set();
  loadTickets();
}

async function registerPresence() {
  try {
    await fetch(buildApiUrl("/api/agents/presence", { role: activeRole }), { method: "POST" });
  } catch (error) {
    console.error(error);
  }
}

function startPresenceHeartbeat() {
  if (presenceIntervalId) {
    window.clearInterval(presenceIntervalId);
  }

  registerPresence();
  presenceIntervalId = window.setInterval(registerPresence, 15000);
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
    await showBrowserNotification("Agent alerts enabled", "You will now receive new-ticket alerts.", "amt-agent-notify-enabled");
  }
}

notificationToggleEl?.addEventListener("click", () => {
  const nextState = !notificationsEnabled;
  setNotificationsEnabled(nextState, nextState);
});

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
    const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/claim`), {
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
    const poolLabel = ticket.role ? `Role pool: ${ticket.role}` : "General pool";
    info.innerHTML = `
      <div class="ticket-number">${ticket.number}</div>
      <div class="meta">Created at ${formatTime(ticket.created_at)}</div>
      <div class="meta">${poolLabel}</div>
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
    const response = await fetch(buildApiUrl("/api/tickets/open", { agent_role: activeRole }));
    if (!response.ok) {
      throw new Error(`Queue fetch failed (${response.status})`);
    }

    const payload = await response.json();
    const tickets = payload.tickets;

    const currentIds = new Set(tickets.map((ticket) => ticket.id));
    const hasNewTicket = [...currentIds].some((id) => !seenTicketIds.has(id));

    if (hasNewTicket && seenTicketIds.size > 0) {
      badgeEl.textContent = "New ticket arrived 🔔";
      showBrowserNotification("New ticket in queue", `${tickets.length} open ticket${tickets.length === 1 ? "" : "s"} in queue.`, "amt-agent-new-ticket");
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

settingsToggleEl?.addEventListener("click", () => {
  if (!settingsPanelEl) {
    return;
  }
  settingsPanelEl.hidden = !settingsPanelEl.hidden;
  if (!settingsPanelEl.hidden) {
    passphraseInputEl?.focus();
  }
});

generatePassphraseEl?.addEventListener("click", () => {
  if (!passphraseInputEl) {
    return;
  }
  passphraseInputEl.value = makeRandomPassphrase();
});

applyPassphraseEl?.addEventListener("click", () => {
  applyPassphrase(passphraseInputEl?.value || null);
});

clearPassphraseEl?.addEventListener("click", () => {
  applyPassphrase(null);
});

applyRoleEl?.addEventListener("click", () => {
  applyRole(roleInputEl?.value || null);
});

clearRoleEl?.addEventListener("click", () => {
  applyRole(null);
});

downloadQrEl?.addEventListener("click", () => {
  if (!userQrImageEl) {
    return;
  }
  const link = document.createElement("a");
  const suffix = activePassphrase || "demo";
  link.download = `amt-queue-${suffix}.png`;
  link.href = userQrImageEl.src;
  link.click();
});

loadTickets();
window.setInterval(loadTickets, 2000);
applyImprintLink();
if (settingsPanelEl) {
  settingsPanelEl.hidden = true;
}
updateQueueModeLabel();
if (passphraseInputEl) {
  passphraseInputEl.value = activePassphrase || "";
}
if (roleInputEl) {
  roleInputEl.value = activeRole || "";
}
renderUserQr();
updateNotificationToggle();
startPresenceHeartbeat();
if (notificationsEnabled && supportsNotifications() && Notification.permission === "default") {
  setNotificationsEnabled(true, false);
}

window.addEventListener("beforeunload", () => {
  if (presenceIntervalId) {
    window.clearInterval(presenceIntervalId);
    presenceIntervalId = null;
  }
});

