const queryParams = new URLSearchParams(window.location.search);
const queryApi = queryParams.get("api");
const queryQueueIdentifier = queryParams.get("queue_identifier") || queryParams.get("passphrase");
const API_BASE_URL = queryApi || window.APP_CONFIG?.API_BASE_URL || "http://localhost:8000";
const NOTIFICATION_ENABLED_KEY = "amt_agent_notifications_enabled";
const QUEUE_IDENTIFIER_STORAGE_KEY = "amt_agent_queue_identifier";
const ROLE_STORAGE_PREFIX = "amt_agent_roles";

const ticketsEl = document.getElementById("tickets");
const badgeEl = document.getElementById("agent-badge");
const agentInlineAlertEl = document.getElementById("agent-inline-alert");
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
const subscribedRolesEl = document.getElementById("subscribed-roles");
const availableRolesEl = document.getElementById("available-roles");
const userQrImageEl = document.getElementById("user-qr");
const userLinkEl = document.getElementById("user-link");
const downloadQrEl = document.getElementById("download-qr");
const imprintLinkEl = document.getElementById("imprint-link");
const PAGE_TITLE_DEFAULT = document.title;

let seenTicketIds = new Set();
let notificationsEnabled = window.localStorage.getItem(NOTIFICATION_ENABLED_KEY) !== "false";
let activeQueueIdentifier = normalizeQueueIdentifier(queryQueueIdentifier)
  || normalizeQueueIdentifier(window.localStorage.getItem(QUEUE_IDENTIFIER_STORAGE_KEY));
let subscribedRoles = loadSubscribedRoles(activeQueueIdentifier);
let availableRoles = [];
let presenceIntervalId = null;
let titlePulseIntervalId = null;
let inlineAlertTimeoutId = null;

function normalizeQueueIdentifier(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return normalized || null;
}

function normalizeRole(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return normalized || null;
}

function roleStorageKey(queueIdentifier) {
  return `${ROLE_STORAGE_PREFIX}:${queueIdentifier || "demo"}`;
}

function loadSubscribedRoles(queueIdentifier) {
  try {
    const raw = window.localStorage.getItem(roleStorageKey(queueIdentifier));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeRole(String(item)))
      .filter((item, index, arr) => item && arr.indexOf(item) === index);
  } catch (error) {
    console.error(error);
    return [];
  }
}

function saveSubscribedRoles(queueIdentifier, roles) {
  if (!roles.length) {
    window.localStorage.removeItem(roleStorageKey(queueIdentifier));
    return;
  }

  window.localStorage.setItem(roleStorageKey(queueIdentifier), JSON.stringify(roles));
}

function buildApiUrl(path, extraParams = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (activeQueueIdentifier) {
    url.searchParams.set("queue_identifier", activeQueueIdentifier);
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
  if (activeQueueIdentifier) {
    userUrl.searchParams.set("queue_identifier", activeQueueIdentifier);
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

function makeRandomQueueIdentifier() {
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

  const queueText = activeQueueIdentifier
    ? `Queue identifier: ${activeQueueIdentifier}`
    : "Queue identifier: demo";
  const rolesText = subscribedRoles.length
    ? `Subscribed roles: ${subscribedRoles.join(", ")} (plus general pool)`
    : "Subscribed roles: none (general pool only)";
  queueModeHintEl.textContent = `${queueText} | ${rolesText}`;
}

function renderRoleChips() {
  if (subscribedRolesEl) {
    if (!subscribedRoles.length) {
      subscribedRolesEl.innerHTML = '<span class="meta">General pool only</span>';
    } else {
      subscribedRolesEl.innerHTML = "";
      subscribedRoles.forEach((role) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "role-chip role-chip-active";
        chip.textContent = `${role} x`;
        chip.addEventListener("click", () => unsubscribeRole(role));
        subscribedRolesEl.appendChild(chip);
      });
    }
  }

  if (availableRolesEl) {
    const nonSubscribed = availableRoles.filter((role) => !subscribedRoles.includes(role));
    if (!nonSubscribed.length) {
      availableRolesEl.innerHTML = '<span class="meta">No extra roles discovered</span>';
    } else {
      availableRolesEl.innerHTML = "";
      nonSubscribed.forEach((role) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "role-chip";
        chip.textContent = `+ ${role}`;
        chip.addEventListener("click", () => subscribeRole(role));
        availableRolesEl.appendChild(chip);
      });
    }
  }
}

async function loadAvailableRoles() {
  try {
    const response = await fetch(buildApiUrl("/api/roles"));
    if (!response.ok) {
      throw new Error(`Role fetch failed (${response.status})`);
    }

    const payload = await response.json();
    availableRoles = Array.isArray(payload.roles)
      ? payload.roles
        .map((role) => normalizeRole(String(role)))
        .filter((role, index, arr) => role && arr.indexOf(role) === index)
      : [];
    renderRoleChips();
  } catch (error) {
    console.error(error);
  }
}

async function renderUserQr() {
  if (!userQrImageEl || !userLinkEl) {
    return;
  }

  const link = suggestedUserLink();
  userLinkEl.textContent = link;
  userLinkEl.href = link;
  userQrImageEl.src = buildQrImageUrl(link);
}

function applyQueueIdentifier(nextValue) {
  activeQueueIdentifier = normalizeQueueIdentifier(nextValue);
  if (activeQueueIdentifier) {
    window.localStorage.setItem(QUEUE_IDENTIFIER_STORAGE_KEY, activeQueueIdentifier);
  } else {
    window.localStorage.removeItem(QUEUE_IDENTIFIER_STORAGE_KEY);
  }

  if (passphraseInputEl) {
    passphraseInputEl.value = activeQueueIdentifier || "";
  }

  subscribedRoles = loadSubscribedRoles(activeQueueIdentifier);
  if (roleInputEl) {
    roleInputEl.value = "";
  }

  saveSubscribedRoles(activeQueueIdentifier, subscribedRoles);
  updateQueueModeLabel();
  renderRoleChips();
  renderUserQr();
  loadAvailableRoles();
  registerPresence();
  seenTicketIds = new Set();
  loadTickets();
}

function subscribeRole(nextRole) {
  const normalized = normalizeRole(nextRole);
  if (!normalized || subscribedRoles.includes(normalized)) {
    return;
  }

  subscribedRoles = subscribedRoles.concat(normalized);
  saveSubscribedRoles(activeQueueIdentifier, subscribedRoles);
  updateQueueModeLabel();
  renderRoleChips();
  registerPresence();
  loadTickets();
}

function unsubscribeRole(role) {
  subscribedRoles = subscribedRoles.filter((item) => item !== role);
  saveSubscribedRoles(activeQueueIdentifier, subscribedRoles);
  updateQueueModeLabel();
  renderRoleChips();
  registerPresence();
  loadTickets();
}

function clearRoles() {
  subscribedRoles = [];
  if (roleInputEl) {
    roleInputEl.value = "";
  }
  saveSubscribedRoles(activeQueueIdentifier, subscribedRoles);
  updateQueueModeLabel();
  renderRoleChips();
  registerPresence();
  loadTickets();
}

async function registerPresence() {
  try {
    await fetch(buildApiUrl("/api/agents/presence", { roles: subscribedRoles.join(",") }), { method: "POST" });
    await loadAvailableRoles();
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

function startTitlePulse(message) {
  if (titlePulseIntervalId) {
    return;
  }

  const alertTitle = `New ticket - ${message}`;
  let showAlert = true;
  document.title = alertTitle;

  titlePulseIntervalId = window.setInterval(() => {
    document.title = showAlert ? alertTitle : PAGE_TITLE_DEFAULT;
    showAlert = !showAlert;
  }, 1100);
}

function stopTitlePulse() {
  if (!titlePulseIntervalId) {
    document.title = PAGE_TITLE_DEFAULT;
    return;
  }

  window.clearInterval(titlePulseIntervalId);
  titlePulseIntervalId = null;
  document.title = PAGE_TITLE_DEFAULT;
}

function playAgentAlertTone() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return;
    }

    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const gain = ctx.createGain();

    oscA.type = "triangle";
    oscA.frequency.value = 880;
    oscB.type = "triangle";
    oscB.frequency.value = 1175;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    oscA.connect(gain);
    oscB.connect(gain);
    gain.connect(ctx.destination);

    oscA.start(now);
    oscB.start(now + 0.18);
    oscA.stop(now + 0.35);
    oscB.stop(now + 0.5);
  } catch (error) {
    console.error(error);
  }
}

function showInlineAlert(message) {
  if (!agentInlineAlertEl) {
    return;
  }

  agentInlineAlertEl.textContent = message;
  agentInlineAlertEl.hidden = false;

  if (inlineAlertTimeoutId) {
    window.clearTimeout(inlineAlertTimeoutId);
  }
  inlineAlertTimeoutId = window.setTimeout(() => {
    if (agentInlineAlertEl) {
      agentInlineAlertEl.hidden = true;
    }
    inlineAlertTimeoutId = null;
  }, 10000);
}

function clearInlineAlert() {
  if (!agentInlineAlertEl) {
    return;
  }

  agentInlineAlertEl.hidden = true;
  if (inlineAlertTimeoutId) {
    window.clearTimeout(inlineAlertTimeoutId);
    inlineAlertTimeoutId = null;
  }
}

async function notifyNewTickets(newTicketCount, totalOpenTickets) {
  const message = newTicketCount === 1
    ? "1 new ticket arrived"
    : `${newTicketCount} new tickets arrived`;

  badgeEl.textContent = `${message} - open: ${totalOpenTickets}`;
  showInlineAlert(message);
  playAgentAlertTone();

  if (document.visibilityState !== "visible") {
    startTitlePulse(message);
  }

  const sent = await showBrowserNotification(
    "New ticket in queue",
    `${message}. ${totalOpenTickets} ticket${totalOpenTickets === 1 ? "" : "s"} open.`,
    "amt-agent-new-ticket"
  );

  if (!sent && notificationsEnabled && notificationToggleEl) {
    notificationToggleEl.textContent = "Alerts limited";
    notificationToggleEl.title = "System notifications may be restricted. In-app alerts remain active.";
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
    ticketsEl.innerHTML = '<div class="empty">No open tickets right now. Enjoy the calm ☕</div>';
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
    const response = await fetch(buildApiUrl("/api/tickets/open", { agent_roles: subscribedRoles.join(",") }));
    if (!response.ok) {
      throw new Error(`Queue fetch failed (${response.status})`);
    }

    const payload = await response.json();
    const tickets = payload.tickets;

    const currentIds = new Set(tickets.map((ticket) => ticket.id));
    const newTicketCount = [...currentIds].filter((id) => !seenTicketIds.has(id)).length;

    if (newTicketCount > 0 && seenTicketIds.size > 0) {
      notifyNewTickets(newTicketCount, tickets.length);
    } else {
      badgeEl.textContent = `Open tickets: ${tickets.length}`;
      if (tickets.length === 0) {
        clearInlineAlert();
      }
    }

    seenTicketIds = currentIds;
    renderTickets(tickets);
  } catch (error) {
    console.error(error);
    badgeEl.textContent = "Disconnected from API. Retrying...";
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    stopTitlePulse();
    loadTickets();
  }
});

settingsToggleEl?.addEventListener("click", () => {
  if (!settingsPanelEl) {
    return;
  }
  settingsPanelEl.hidden = !settingsPanelEl.hidden;
  if (!settingsPanelEl.hidden) {
    loadAvailableRoles();
    passphraseInputEl?.focus();
  }
});

generatePassphraseEl?.addEventListener("click", () => {
  if (!passphraseInputEl) {
    return;
  }
  passphraseInputEl.value = makeRandomQueueIdentifier();
});

applyPassphraseEl?.addEventListener("click", () => {
  applyQueueIdentifier(passphraseInputEl?.value || null);
});

clearPassphraseEl?.addEventListener("click", () => {
  applyQueueIdentifier(null);
});

applyRoleEl?.addEventListener("click", () => {
  subscribeRole(roleInputEl?.value || null);
  if (roleInputEl) {
    roleInputEl.value = "";
  }
});

clearRoleEl?.addEventListener("click", () => {
  clearRoles();
});

downloadQrEl?.addEventListener("click", () => {
  if (!userQrImageEl) {
    return;
  }
  const link = document.createElement("a");
  const suffix = activeQueueIdentifier || "demo";
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
  passphraseInputEl.value = activeQueueIdentifier || "";
}
renderRoleChips();
renderUserQr();
loadAvailableRoles();
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
  stopTitlePulse();
  clearInlineAlert();
});
