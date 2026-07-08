const queryApi = new URLSearchParams(window.location.search).get("api");
const API_BASE_URL = queryApi || window.APP_CONFIG?.API_BASE_URL || "http://localhost:8000";
const NOTIFICATION_ENABLED_KEY = "amt_agent_notifications_enabled";

const ticketsEl = document.getElementById("tickets");
const badgeEl = document.getElementById("agent-badge");
const notificationToggleEl = document.getElementById("notification-toggle");
const imprintLinkEl = document.getElementById("imprint-link");
let seenTicketIds = new Set();
let notificationsEnabled = window.localStorage.getItem(NOTIFICATION_ENABLED_KEY) !== "false";

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

loadTickets();
window.setInterval(loadTickets, 2000);
applyImprintLink();
updateNotificationToggle();
if (notificationsEnabled && supportsNotifications() && Notification.permission === "default") {
  setNotificationsEnabled(true, false);
}

