const queryApi = new URLSearchParams(window.location.search).get("api");
const API_BASE_URL = queryApi || window.APP_CONFIG?.API_BASE_URL || "http://localhost:8000";
const NOTIFICATION_ENABLED_KEY = "amt_agent_notifications_enabled";
const PASSPHRASE_STORAGE_KEY = "amt_agent_passphrase";

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
const userQrImageEl = document.getElementById("user-qr");
const userLinkEl = document.getElementById("user-link");
const downloadQrEl = document.getElementById("download-qr");
const imprintLinkEl = document.getElementById("imprint-link");
let seenTicketIds = new Set();
let notificationsEnabled = window.localStorage.getItem(NOTIFICATION_ENABLED_KEY) !== "false";
let activePassphrase = normalizePassphrase(new URLSearchParams(window.location.search).get("passphrase")) ||
  normalizePassphrase(window.localStorage.getItem(PASSPHRASE_STORAGE_KEY));

function normalizePassphrase(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-\s]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
  return normalized || null;
}

function buildApiUrl(path) {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (activePassphrase) {
    url.searchParams.set("passphrase", activePassphrase);
  }
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

  queueModeHintEl.textContent = activePassphrase
    ? `Scoped mode: ${activePassphrase}`
    : "Demo mode (no passphrase)";
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

  updateQueueModeLabel();
  renderUserQr();
  seenTicketIds = new Set();
  loadTickets();
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
    const response = await fetch(buildApiUrl("/api/tickets/open"));
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
renderUserQr();
updateNotificationToggle();
if (notificationsEnabled && supportsNotifications() && Notification.permission === "default") {
  setNotificationsEnabled(true, false);
}

