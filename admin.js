const ADMIN_TOKEN_KEY = "legendary.admin.token";
const ADMIN_SEEN_BOOKINGS_KEY = "legendary.admin.seenBookingIds";
const loginPanel = document.querySelector("#loginPanel");
const dashboardPanel = document.querySelector("#dashboardPanel");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminEmail = document.querySelector("#adminEmail");
const adminPassword = document.querySelector("#adminPassword");
const adminStatus = document.querySelector("#adminStatus");
const adminBookings = document.querySelector("#adminBookings");
const adminStats = document.querySelector("#adminStats");
const systemStatus = document.querySelector("#systemStatus");
const adminUserForm = document.querySelector("#adminUserForm");
const adminUserEmail = document.querySelector("#adminUserEmail");
const adminUserPassword = document.querySelector("#adminUserPassword");
const adminUserRole = document.querySelector("#adminUserRole");
const adminUserActive = document.querySelector("#adminUserActive");
const adminUsersStatus = document.querySelector("#adminUsersStatus");
const adminUsers = document.querySelector("#adminUsers");
const adminUsersPanel = document.querySelector("#adminUsersPanel");
const activityFeed = document.querySelector("#activityFeed");
const adminActionStatus = document.querySelector("#adminActionStatus");
const createTestBookingButton = document.querySelector("#createTestBookingButton");
const sendTestNotificationButton = document.querySelector("#sendTestNotificationButton");
const refreshBookingsButton = document.querySelector("#refreshBookingsButton");
const logoutButton = document.querySelector("#logoutButton");
const enableAdminNotificationsButton = document.querySelector("#enableAdminNotificationsButton");
const customerSearchInput = document.querySelector("#customerSearchInput");
const clearCustomerSearchButton = document.querySelector("#clearCustomerSearchButton");
const customerSearchStatus = document.querySelector("#customerSearchStatus");
const scheduleQueue = document.querySelector("#scheduleQueue");
const membersList = document.querySelector("#membersList");
const panelToggles = [...document.querySelectorAll("[data-toggle-panel]")];
const pendingHeading = document.querySelector(".pending-heading");
const MEMBER_ACCOUNTS_KEY = "legendary-auto-spa.memberAccounts";
const LAST_RECEIPT_KEY = "legendary.admin.lastReceipt";

const statuses = ["new", "contacted", "scheduled", "in_progress", "complete", "canceled"];
const paymentStatuses = ["not_started", "pending", "requires_capture", "succeeded", "canceled", "failed"];
const serviceTierOptions = [
  "Signature Wash",
  "Interior Detail",
  "Inside & Out Detail",
  "Full Reset Detail",
  "Executive Showroom Detail"
];
const vehicleSizeOptions = [
  { value: "cars", label: "Car / Sedan / Coupe" },
  { value: "suvs", label: "SUV / Crossover" },
  { value: "trucks", label: "Truck / Large SUV" }
];
const adminTimeOptions = [
  "7:00 AM",
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
  "7:00 PM"
];
const backendSetupLinks = {
  netlify: "https://app.netlify.com/sites/legendaryautospa/configuration/env",
  supabase: "https://supabase.com/dashboard/projects",
  twilio: "https://console.twilio.com/us1/develop/phone-numbers/manage/incoming",
  square: "https://developer.squareup.com/apps",
  squareWebhooks: "https://developer.squareup.com/apps",
  resend: "https://resend.com/api-keys"
};
let allBookings = [];
let seenBookingIds = new Set();
let bookingsLoadedOnce = false;
let bookingPollTimer = null;

function token() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

function adminClaims() {
  const value = token();
  if (!value) return { role: "viewer" };
  try {
    return JSON.parse(decodeBase64Url(value.split(".")[0])) || { role: "viewer" };
  } catch {
    return { role: "viewer" };
  }
}

function decodeBase64Url(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return atob(padded);
}

function hasAdminRole(roles) {
  return roles.includes(adminClaims().role || "viewer");
}

function sessionIsValid() {
  const claims = adminClaims();
  return Boolean(token() && claims.exp && claims.exp > Date.now());
}

function applyRoleUi() {
  const isAdmin = hasAdminRole(["admin"]);
  const canCreateTestBooking = hasAdminRole(["admin", "manager"]);
  adminUsersPanel.classList.toggle("hidden", !isAdmin);
  createTestBookingButton.hidden = !canCreateTestBooking;
  sendTestNotificationButton.hidden = !canCreateTestBooking;
  enableAdminNotificationsButton.hidden = !canCreateTestBooking;
}

function setLoggedIn(loggedIn) {
  loginPanel.classList.toggle("hidden", loggedIn);
  dashboardPanel.classList.toggle("hidden", !loggedIn);
  if (loggedIn) applyRoleUi();
}

function clearAdminSession(message = "Admin session expired. Log in again.") {
  void removeAdminPushSubscription({ localOnly: true });
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  setLoggedIn(false);
  adminPassword.value = "";
  adminStatus.textContent = message;
}

function readSeenBookingIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(ADMIN_SEEN_BOOKINGS_KEY)) || []);
  } catch {
    return new Set();
  }
}

function saveSeenBookingIds(ids) {
  localStorage.setItem(ADMIN_SEEN_BOOKINGS_KEY, JSON.stringify([...ids].slice(0, 300)));
}

async function api(path, options = {}) {
  const result = await fetch(`/.netlify/functions/${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: token() ? `Bearer ${token()}` : "",
      ...(options.headers || {})
    }
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    if (result.status === 401) {
      clearAdminSession(data.error || "Admin session expired. Log in again.");
    }
    const error = new Error(data.error || "Request failed");
    error.status = result.status;
    throw error;
  }
  return data;
}

async function publicConfig() {
  const result = await fetch("/.netlify/functions/public-config");
  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    throw new Error(data.error || "Could not load public config");
  }
  return data;
}

function supportsAdminPush() {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

function isAppleMobileDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function adminPushDeviceLabel() {
  return [
    navigator.platform || "",
    navigator.userAgent.includes("Mobile") ? "mobile" : "desktop"
  ].filter(Boolean).join(" · ");
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function ensureAdminServiceWorker() {
  await navigator.serviceWorker.register("service-worker.js");
  return navigator.serviceWorker.ready;
}

function adminPushReadyMessage() {
  if (isAppleMobileDevice()) {
    return "Admin push alerts are enabled on this device. On iPhone and iPad, background alerts only work from the Home Screen app.";
  }
  return "Admin push alerts are enabled on this device.";
}

async function ensureAdminPushSubscription({ prompt = false, announce = false } = {}) {
  if (!token()) return false;

  if (!supportsAdminPush()) {
    if (announce) {
      adminActionStatus.textContent = "This browser does not support background web push for the admin dashboard.";
    }
    return false;
  }

  if (isAppleMobileDevice() && !isStandaloneApp()) {
    if (announce) {
      adminActionStatus.textContent = "On iPhone and iPad, add the admin app to the Home Screen first. Background alerts do not work from a normal browser tab.";
    }
    return false;
  }

  const config = await publicConfig();
  if (!config.push_enabled || !config.push_public_key) {
    if (announce) {
      adminActionStatus.textContent = "Admin push alerts are not configured on the backend yet.";
    }
    return false;
  }

  let permission = Notification.permission;
  if (prompt && permission !== "granted") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    if (announce) {
      adminActionStatus.textContent = permission === "denied"
        ? "Browser notifications are blocked for this device."
        : "Admin push alerts were not enabled.";
    }
    return false;
  }

  const registration = await ensureAdminServiceWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.push_public_key)
    });
  }

  await api("admin-push-subscription", {
    method: "POST",
    body: JSON.stringify({
      subscription: subscription.toJSON ? subscription.toJSON() : subscription,
      device_label: adminPushDeviceLabel(),
      user_agent: navigator.userAgent
    })
  });

  if (announce) {
    adminActionStatus.textContent = adminPushReadyMessage();
  }
  return true;
}

async function removeAdminPushSubscription({ localOnly = false } = {}) {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.pushManager) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  if (!localOnly && token()) {
    try {
      await api("admin-push-subscription", {
        method: "DELETE",
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });
    } catch (error) {
      console.warn("Admin push unsubscribe sync failed", error.message);
    }
  }

  try {
    await subscription.unsubscribe();
  } catch (error) {
    console.warn("Admin push local unsubscribe failed", error.message);
  }
}

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminStatus.textContent = "Checking admin access...";
  try {
    const data = await api("admin-login", {
      method: "POST",
      body: JSON.stringify({ email: adminEmail.value, password: adminPassword.value })
    });
    localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
    setLoggedIn(true);
    adminPassword.value = "";
    adminStatus.textContent = "";
    await loadHealth();
    if (hasAdminRole(["admin"])) await loadAdminUsers();
    await loadActivity();
    await loadBookings();
    renderMembers();
    startBookingPolling();
    await ensureAdminPushSubscription();
  } catch (error) {
    adminStatus.textContent = error.message;
  }
});

refreshBookingsButton.addEventListener("click", async () => {
  await loadHealth();
  if (hasAdminRole(["admin"])) await loadAdminUsers();
  await loadActivity();
  await loadBookings();
  renderMembers();
});

logoutButton.addEventListener("click", async () => {
  await removeAdminPushSubscription();
  clearAdminSession("");
});

createTestBookingButton.addEventListener("click", createTestBooking);
sendTestNotificationButton.addEventListener("click", sendTestNotification);
enableAdminNotificationsButton.addEventListener("click", requestAdminNotificationPermission);

customerSearchInput.addEventListener("input", renderFilteredBookings);
clearCustomerSearchButton.addEventListener("click", () => {
  customerSearchInput.value = "";
  renderFilteredBookings();
  customerSearchInput.focus();
});

panelToggles.forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const target = document.querySelector(`#${toggle.dataset.togglePanel}`);
    if (!target) return;
    const nextOpen = target.classList.contains("hidden");
    target.classList.toggle("hidden", !nextOpen);
    toggle.setAttribute("aria-expanded", String(nextOpen));
    const label = toggle.querySelector("span");
    if (label) label.textContent = nextOpen ? "Close" : "Open";
  });
});

adminUserForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveAdminUser({
    email: adminUserEmail.value,
    password: adminUserPassword.value,
    role: adminUserRole.value,
    active: adminUserActive.checked
  });
  adminUserForm.reset();
  adminUserActive.checked = true;
});

async function loadBookings(options = {}) {
  const scrollY = window.scrollY;
  if (!options.silent) adminBookings.innerHTML = '<p class="empty-state">Loading bookings...</p>';
  try {
    const data = await api("admin-bookings");
    const nextBookings = data.bookings || [];
    notifyNewBookings(nextBookings);
    allBookings = nextBookings;
    renderFilteredBookings();
    if (options.preserveScroll) {
      window.requestAnimationFrame(() => window.scrollTo({ top: scrollY, left: 0, behavior: "auto" }));
    }
  } catch (error) {
    if (!options.silent) adminBookings.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

async function requestAdminNotificationPermission() {
  try {
    await ensureAdminPushSubscription({ prompt: true, announce: true });
  } catch (error) {
    adminActionStatus.textContent = error.message;
  }
}

function notifyNewBookings(bookings) {
  const ids = new Set(bookings.map((booking) => booking.id).filter(Boolean));
  if (!bookingsLoadedOnce) {
    const savedSeen = readSeenBookingIds();
    seenBookingIds = savedSeen.size ? new Set([...savedSeen, ...ids]) : ids;
    saveSeenBookingIds(seenBookingIds);
    bookingsLoadedOnce = true;
    return;
  }

  const newBookings = bookings.filter((booking) => booking.id && !seenBookingIds.has(booking.id));
  seenBookingIds = ids;
  saveSeenBookingIds(seenBookingIds);
  if (!newBookings.length) return;

  const latest = newBookings[0];
  adminActionStatus.textContent = `${newBookings.length} new request${newBookings.length === 1 ? "" : "s"} received. Latest: ${latest.customer_name || "Customer"} for ${latest.service_tier || "a detail"}.`;
  document.title = `(${newBookings.length}) Legendary Admin`;
  window.setTimeout(() => {
    document.title = "Legendary Admin";
  }, 15000);

}

function startBookingPolling() {
  if (bookingPollTimer) return;
  bookingPollTimer = window.setInterval(() => {
    if (dashboardPanel.classList.contains("hidden")) return;
    loadBookings({ silent: true, preserveScroll: true });
  }, 60000);
}

function renderFilteredBookings() {
  const query = String(customerSearchInput?.value || "").trim().toLowerCase();
  const visibleBookings = query
    ? allBookings.filter((booking) => bookingMatchesQuery(booking, query))
    : pendingBookings(allBookings);

  if (customerSearchStatus) {
    customerSearchStatus.textContent = query
      ? `Showing ${visibleBookings.length} of ${allBookings.length} matching booking${visibleBookings.length === 1 ? "" : "s"}.`
      : `Showing ${visibleBookings.length} pending request${visibleBookings.length === 1 ? "" : "s"}.`;
  }

  renderBookings(visibleBookings);
  renderScheduleQueue(allBookings);
}

function bookingMatchesQuery(booking, query) {
  return [
    booking.customer_name,
    booking.phone,
    booking.email,
    booking.vehicle_year,
    booking.vehicle_make,
    booking.vehicle_model,
    booking.vehicle_size,
    booking.service_address,
    booking.service_tier,
    booking.status,
    booking.payment_status
  ].some((value) => String(value || "").toLowerCase().includes(query));
}

function recurringFrequency(booking) {
  const match = String(booking.notes || "").match(/Recurring service:\s*([^\n]+)/i);
  return match?.[1]?.trim() || "";
}

function pendingBookings(bookings) {
  return bookings.filter((booking) => ["new", "contacted"].includes(booking.status || "new"));
}

function scheduledBookings(bookings) {
  return bookings.filter((booking) => ["scheduled", "in_progress"].includes(booking.status || ""));
}

function renderScheduleQueue(bookings) {
  const scheduled = scheduledBookings(bookings);
  if (!scheduled.length) {
    scheduleQueue.innerHTML = '<p class="empty-state">No accepted requests yet. Pending requests will move here after an admin accepts them.</p>';
    return;
  }

  const canUpdateBookings = hasAdminRole(["admin", "manager"]);
  const canCapturePayment = hasAdminRole(["admin"]);
  scheduleQueue.innerHTML = scheduled.map((booking) => {
    const recurring = recurringFrequency(booking);
    const canCaptureThisPayment = canCapturePayment && booking.payment_intent_id && booking.payment_status !== "succeeded";
    const panelId = queuePanelId(booking);
    return `
    <article class="queue-booking" data-id="${escapeAttribute(booking.id || "")}" data-payment-intent-id="${escapeAttribute(booking.payment_intent_id || "")}">
      <div class="queue-booking-summary">
        <button class="queue-booking-toggle" type="button" data-toggle-queue aria-expanded="false" aria-controls="${panelId}">
          <div>
            <strong>${escapeHtml(booking.customer_name || "Customer")}${recurring ? ` · ${escapeHtml(recurring)}` : ""}</strong>
            <p>${escapeHtml(booking.service_tier || "Detail request")} · ${escapeHtml(booking.preferred_date || "No date")} · ${escapeHtml(booking.preferred_time || "No time")}</p>
            <small>${escapeHtml([booking.vehicle_year, booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" "))} · ${escapeHtml(booking.service_address || "")}</small>
          </div>
          <span class="queue-open-indicator">Open</span>
        </button>
        ${canUpdateBookings ? `
          <div class="queue-actions">
            <span class="status-pill">${escapeHtml(booking.status || "scheduled")}</span>
            ${canCaptureThisPayment ? '<button class="secondary-button compact-button" type="button" data-capture>Capture</button>' : ""}
            <button class="secondary-button compact-button" type="button" data-decline>Decline</button>
          </div>
        ` : `<span>${escapeHtml(booking.status || "scheduled")}<small>${formatDate(booking.created_at)}</small></span>`}
      </div>
      <div class="queue-booking-panel hidden" id="${panelId}">
        <div class="booking-head">
          <div>
            <h3><button class="customer-history-button" type="button" data-customer-history="${escapeAttribute(customerHistoryQuery(booking))}">${escapeHtml(booking.customer_name || "Customer")}</button></h3>
            <p>${escapeHtml(booking.phone || "")} ${booking.email ? `· ${escapeHtml(booking.email)}` : ""}</p>
          </div>
          <span class="status-pill">${escapeHtml(booking.status || "scheduled")}</span>
        </div>

        ${renderBookingMeta(booking)}
        ${renderBackendRecords(booking)}
        ${renderBookingControls(booking, canUpdateBookings, canCapturePayment, {
          includeSchedulingFields: true,
          hideAccept: true
        })}
      </div>
    </article>
  `;
  }).join("");

  scheduleQueue.querySelectorAll("[data-toggle-queue]").forEach((button) => {
    button.addEventListener("click", () => toggleQueueBooking(button.closest(".queue-booking")));
  });

  scheduleQueue.querySelectorAll("[data-save]").forEach((button) => {
    button.addEventListener("click", () => saveBooking(button.closest("[data-id]")));
  });

  scheduleQueue.querySelectorAll("[data-decline]").forEach((button) => {
    button.addEventListener("click", () => quickUpdateBooking(button.closest("[data-id]"), "canceled"));
  });

  scheduleQueue.querySelectorAll("[data-capture]").forEach((button) => {
    button.addEventListener("click", () => capturePayment(button.closest("[data-id]")));
  });

  scheduleQueue.querySelectorAll("[data-customer-history]").forEach((button) => {
    button.addEventListener("click", () => {
      customerSearchInput.value = button.dataset.customerHistory || "";
      renderFilteredBookings();
      customerSearchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

function queuePanelId(booking) {
  return `queue-booking-${String(booking.id || "").replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function toggleQueueBooking(card) {
  if (!card) return;
  const panel = card.querySelector(".queue-booking-panel");
  const button = card.querySelector("[data-toggle-queue]");
  const indicator = card.querySelector(".queue-open-indicator");
  if (!panel || !button || !indicator) return;

  const nextHidden = !panel.classList.contains("hidden");
  panel.classList.toggle("hidden", nextHidden);
  card.classList.toggle("open", !nextHidden);
  button.setAttribute("aria-expanded", nextHidden ? "false" : "true");
  indicator.textContent = nextHidden ? "Open" : "Close";
}

function readMemberAccounts() {
  try {
    return JSON.parse(localStorage.getItem(MEMBER_ACCOUNTS_KEY)) || {};
  } catch {
    return {};
  }
}

async function renderMembers() {
  membersList.innerHTML = '<p class="empty-state">Loading members...</p>';
  let members = [];
  try {
    const data = await api("admin-members");
    members = data.members || [];
  } catch (error) {
    members = Object.values(readMemberAccounts());
    if (!members.length) {
      membersList.innerHTML = `<p class="empty-state">${escapeHtml(error.message || "No member accounts found.")}</p>`;
      return;
    }
  }

  if (!members.length) {
    membersList.innerHTML = '<p class="empty-state">No member accounts yet.</p>';
    return;
  }

  membersList.innerHTML = members.map((member) => {
    const vehicles = (member.vehicles || member.member_vehicles || []).map((vehicle) => [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")).filter(Boolean);
    const locations = (member.locations || member.member_locations || []).map((location) => location.address).filter(Boolean);
    const requests = member.recent_requests || [];
    const latestRequest = requests[0];
    return `
      <article class="activity-item">
        <div>
          <strong><button class="customer-history-button" type="button" data-member-history="${escapeAttribute(member.phone || "")}">${escapeHtml(member.name || "Member")}</button> · ${escapeHtml(formatPhone(member.phone || ""))}</strong>
          <p>${escapeHtml(vehicles.length ? vehicles.join(" | ") : "No saved vehicles")}</p>
          <small>${escapeHtml(locations.length ? locations.join(" | ") : "No saved locations")}</small>
          ${latestRequest ? `<small>Latest: ${escapeHtml(latestRequest.service_tier || "Detail request")} · ${escapeHtml(latestRequest.status || "new")} · ${formatDate(latestRequest.created_at)}</small>` : ""}
        </div>
        <span>
          ${requests.length} request${requests.length === 1 ? "" : "s"}
          <small>${formatDate(member.updated_at || member.updatedAt || member.created_at || member.createdAt)}</small>
        </span>
      </article>
    `;
  }).join("");

  membersList.querySelectorAll("[data-member-history]").forEach((button) => {
    button.addEventListener("click", () => {
      customerSearchInput.value = button.dataset.memberHistory || "";
      renderFilteredBookings();
      customerSearchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

async function loadHealth() {
  systemStatus.innerHTML = '<p class="empty-state">Checking system status...</p>';
  try {
    const data = await api("health");
    renderHealth(data);
  } catch (error) {
    systemStatus.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

async function createTestBooking() {
  adminActionStatus.textContent = "Creating a test booking...";
  createTestBookingButton.disabled = true;
  try {
    const data = await api("create-test-booking", { method: "POST" });
    adminActionStatus.textContent = data.ok
      ? "Test booking created. Check Bookings and Activity Feed."
      : "Test booking request finished.";
    await loadHealth();
    await loadActivity();
    await loadBookings();
  } catch (error) {
    adminActionStatus.textContent = error.message;
  } finally {
    createTestBookingButton.disabled = false;
  }
}

async function sendTestNotification() {
  adminActionStatus.textContent = "Sending test notification...";
  sendTestNotificationButton.disabled = true;
  try {
    const data = await api("send-test-notification", { method: "POST" });
    adminActionStatus.textContent = data.ok
      ? "Test notification sent. Check Activity Feed for provider details."
      : "Notification providers are not fully configured. Check Activity Feed.";
    await loadHealth();
    await loadActivity();
  } catch (error) {
    adminActionStatus.textContent = error.message;
  } finally {
    sendTestNotificationButton.disabled = false;
  }
}

async function loadAdminUsers() {
  adminUsers.innerHTML = '<p class="empty-state">Loading admin users...</p>';
  try {
    const data = await api("admin-users");
    renderAdminUsers(data.admin_users || []);
  } catch (error) {
    adminUsers.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

async function loadActivity() {
  activityFeed.innerHTML = '<p class="empty-state">Loading activity...</p>';
  try {
    const data = await api("admin-events");
    renderActivity(data.events || []);
  } catch (error) {
    activityFeed.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

function renderActivity(events) {
  if (!events.length) {
    activityFeed.innerHTML = '<p class="empty-state">No backend activity yet.</p>';
    return;
  }

  activityFeed.innerHTML = events.slice(0, 12).map((event) => {
    const booking = Array.isArray(event.bookings) ? event.bookings[0] : event.bookings;
    const customer = booking?.customer_name || "Backend";
    const service = booking?.service_tier ? ` · ${booking.service_tier}` : "";
    const channel = event.channel ? ` · ${event.channel}` : "";
    const details = formatActivityDetails(event.details);
    return `
      <article class="activity-item ${escapeAttribute(event.status || "info")}">
        <div>
          <strong>${escapeHtml(event.message || event.event_type)}</strong>
          <p>${escapeHtml(customer)}${escapeHtml(service)}${escapeHtml(channel)}</p>
          ${details ? `<small>${escapeHtml(details)}</small>` : ""}
        </div>
        <span>
          ${escapeHtml(event.status || "info")}
          <small>${formatDate(event.created_at)}</small>
        </span>
      </article>
    `;
  }).join("");
}

function formatActivityDetails(details) {
  if (!details || typeof details !== "object") return "";
  if (details.provider_id) return `Provider ID: ${details.provider_id}`;

  const missing = [
    ...(Array.isArray(details.email_missing) ? details.email_missing : []),
    ...(Array.isArray(details.sms_missing) ? details.sms_missing : [])
  ];
  if (missing.length) return `Missing: ${missing.join(", ")}`;

  if (details.square_payment_id) return `Square payment: ${details.square_payment_id}`;
  if (details.payment_intent_id) return `Payment: ${details.payment_intent_id}`;
  return "";
}

function renderAdminUsers(users) {
  if (!users.length) {
    adminUsers.innerHTML = '<p class="empty-state">No approved admin users yet.</p>';
    return;
  }

  adminUsers.innerHTML = users.map((user) => `
    <article class="admin-user-card" data-email="${escapeAttribute(user.email || "")}">
      <div>
        <strong>${escapeHtml(user.email || "Admin")}</strong>
        <span>${escapeHtml(user.role || "admin")} · ${user.active ? "active" : "inactive"}</span>
        <p>Updated ${formatDate(user.updated_at || user.created_at)}</p>
      </div>
      <div class="admin-user-controls">
        <select data-admin-role>
          ${["admin", "manager", "viewer"].map((role) => `<option value="${role}" ${user.role === role ? "selected" : ""}>${role}</option>`).join("")}
        </select>
        <label class="checkbox-label">
          <input type="checkbox" data-admin-active ${user.active ? "checked" : ""}>
          Active
        </label>
        <input type="password" data-admin-password autocomplete="new-password" placeholder="New password optional">
        <button class="secondary-button" type="button" data-admin-save>Update</button>
      </div>
    </article>
  `).join("");

  adminUsers.querySelectorAll("[data-admin-save]").forEach((button) => {
    button.addEventListener("click", () => saveAdminUserFromCard(button.closest(".admin-user-card")));
  });
}

async function saveAdminUser(input) {
  adminUsersStatus.textContent = "Saving admin user...";
  try {
    await api("admin-users", {
      method: "POST",
      body: JSON.stringify(input)
    });
    adminUsersStatus.textContent = "Admin user saved.";
    await loadAdminUsers();
  } catch (error) {
    adminUsersStatus.textContent = error.message;
  }
}

async function saveAdminUserFromCard(card) {
  const button = card.querySelector("[data-admin-save]");
  button.textContent = "Saving...";
  await saveAdminUser({
    email: card.dataset.email,
    password: card.querySelector("[data-admin-password]").value,
    role: card.querySelector("[data-admin-role]").value,
    active: card.querySelector("[data-admin-active]").checked
  });
  button.textContent = "Update";
}

function renderHealth(data) {
  const checks = Object.entries(data.checks || {});
  if (!checks.length) {
    systemStatus.innerHTML = '<p class="empty-state">No system checks returned.</p>';
    return;
  }

  systemStatus.innerHTML = `
    <div class="health-head">
      <div>
        <span class="eyebrow">System Status</span>
        <strong>${data.ok ? "Ready for live operations" : "Setup still needed"}</strong>
      </div>
      <span class="status-pill">${data.ok ? "Live ready" : "Needs setup"}</span>
    </div>
    <div class="health-grid">
      ${checks.map(([key, check]) => {
        const link = healthLinkFor(key, check);
        return `
        <article class="health-card ${check.ok ? "ok" : "warn"}">
          <span>${check.ok ? "Ready" : "Needs setup"}</span>
          <strong>${escapeHtml(check.label)}</strong>
          <p>${escapeHtml(check.detail)}</p>
          <a href="${escapeAttribute(link.href)}" target="_blank" rel="noopener">${escapeHtml(link.label)}</a>
        </article>
      `;
      }).join("")}
    </div>
  `;
}

function healthLinkFor(key, check) {
  const label = String(check?.label || "").toLowerCase();
  if (key.includes("sms") || label.includes("sms") || label.includes("twilio")) {
    return { href: backendSetupLinks.twilio, label: "Open Twilio SMS settings" };
  }
  if (key.includes("email") || label.includes("email")) {
    return { href: backendSetupLinks.resend, label: "Open email settings" };
  }
  if (key.includes("square_webhook") || label.includes("webhook")) {
    return { href: backendSetupLinks.squareWebhooks, label: "Open Square webhooks" };
  }
  if (key.includes("square") || label.includes("square") || label.includes("payment")) {
    return { href: backendSetupLinks.square, label: "Open Square payments" };
  }
  if (key.includes("schema") || key.includes("constraint") || label.includes("schema") || label.includes("constraint")) {
    return { href: backendSetupLinks.supabase, label: "Open Supabase SQL editor" };
  }
  if (key.includes("supabase") || label.includes("supabase") || label.includes("database")) {
    return { href: backendSetupLinks.supabase, label: "Open Supabase project" };
  }
  return { href: backendSetupLinks.netlify, label: "Open Netlify environment variables" };
}

function renderBookings(bookings) {
  renderStats(bookings);
  if (!bookings.length) {
    adminBookings.innerHTML = '<p class="empty-state">No pending requests right now.</p>';
    return;
  }

  const canUpdateBookings = hasAdminRole(["admin", "manager"]);
  const canCapturePayment = hasAdminRole(["admin"]);
  adminBookings.innerHTML = bookings.map((booking) => {
    return `
    <article class="admin-booking" data-id="${escapeAttribute(booking.id || "")}" data-payment-intent-id="${escapeAttribute(booking.payment_intent_id || "")}">
      <div class="booking-head">
        <div>
          <h3><button class="customer-history-button" type="button" data-customer-history="${escapeAttribute(customerHistoryQuery(booking))}">${escapeHtml(booking.customer_name || "Customer")}</button></h3>
          <p>${escapeHtml(booking.phone || "")} ${booking.email ? `· ${escapeHtml(booking.email)}` : ""}</p>
        </div>
        <span class="status-pill">${escapeHtml(booking.status || "new")}</span>
      </div>

      ${renderBookingMeta(booking)}

      ${renderBackendRecords(booking)}

      ${renderBookingControls(booking, canUpdateBookings, canCapturePayment)}
    </article>
  `;
  }).join("");

  adminBookings.querySelectorAll("[data-save]").forEach((button) => {
    button.addEventListener("click", () => saveBooking(button.closest(".admin-booking")));
  });

  adminBookings.querySelectorAll("[data-capture]").forEach((button) => {
    button.addEventListener("click", () => capturePayment(button.closest(".admin-booking")));
  });

  adminBookings.querySelectorAll("[data-accept]").forEach((button) => {
    button.addEventListener("click", () => quickUpdateBooking(button.closest(".admin-booking"), "scheduled"));
  });

  adminBookings.querySelectorAll("[data-decline]").forEach((button) => {
    button.addEventListener("click", () => quickUpdateBooking(button.closest(".admin-booking"), "canceled"));
  });

  adminBookings.querySelectorAll("[data-customer-history]").forEach((button) => {
    button.addEventListener("click", () => {
      customerSearchInput.value = button.dataset.customerHistory || "";
      renderFilteredBookings();
      customerSearchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

function customerHistoryQuery(booking) {
  return booking.phone || booking.email || booking.customer_name || "";
}

function renderBookingMeta(booking) {
  const pricing = pricingSummary(booking);
  const mapsUrl = googleMapsUrl(booking.service_address);
  const recurring = recurringFrequency(booking);

  return `
    <div class="booking-meta">
      <div><span>Package</span><strong>${escapeHtml(booking.service_tier)}</strong><p>${escapeHtml(pricing.packageLabel)}</p></div>
      <div><span>Vehicle</span><strong>${escapeHtml([booking.vehicle_year, booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" "))}</strong><p>${escapeHtml(vehicleSizeDisplay(booking.vehicle_size))}</p></div>
      <div><span>Focus</span><strong>${escapeHtml(booking.focus_area)}</strong><p>${escapeHtml(booking.focus_goal)}</p></div>
      <div><span>Add-ons</span><strong>${escapeHtml(booking.add_ons || "None")}</strong><p>${escapeHtml(pricing.addOnsLabel)}</p></div>
      <div><span>Estimated total</span><strong>${escapeHtml(pricing.totalLabel)}</strong><p>Package plus selected add-ons</p></div>
      <div><span>Schedule</span><strong>${escapeHtml(booking.preferred_date)}</strong><p>${escapeHtml(booking.preferred_time)}</p></div>
      <div><span>Recurring</span><strong>${escapeHtml(recurring || "No")}</strong><p>${escapeHtml(recurring ? "Will repeat after accepted" : "One-time request")}</p></div>
      <div><span>Location</span><strong>${escapeHtml(booking.service_address)}</strong><p>${escapeHtml(booking.notes)}</p>${mapsUrl ? `<a href="${escapeAttribute(mapsUrl)}" target="_blank" rel="noopener">Open in Google Maps</a>` : ""}</div>
      <div><span>Payment</span><strong>${escapeHtml(booking.payment_preference)}</strong><p>${escapeHtml(booking.payment_status)}</p></div>
      <div><span>Assigned</span><strong>${escapeHtml(booking.assigned_to || "Unassigned")}</strong><p>${formatDate(booking.created_at)}</p></div>
      <div><span>Square</span><strong>${escapeHtml(shortReference(booking.payment_intent_id) || "None")}</strong><p>${escapeHtml(booking.recommended_tier || "")}</p></div>
    </div>
  `;
}

function renderBookingControls(booking, canUpdateBookings, canCapturePayment, options = {}) {
  if (!canUpdateBookings) {
    return '<p class="empty-state permission-note">Viewer access: booking details are read-only.</p>';
  }

  const schedulingFields = options.includeSchedulingFields ? `
      <label>
        <span>Wash type</span>
        <select data-field="service_tier">
          ${serviceTierOptions.map((tier) => `<option value="${escapeAttribute(tier)}" ${booking.service_tier === tier ? "selected" : ""}>${escapeHtml(tier)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Vehicle type</span>
        <select data-field="vehicle_size">
          ${vehicleSizeOptions.map((option) => `<option value="${option.value}" ${booking.vehicle_size === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Date</span>
        <input data-field="preferred_date" type="date" value="${escapeAttribute(booking.preferred_date || "")}">
      </label>
      <label>
        <span>Time</span>
        <select data-field="preferred_time">
          ${renderTimeOptions(booking.preferred_time)}
        </select>
      </label>
    ` : "";

  return `
    <div class="booking-controls">
      ${schedulingFields}
      <label>
        <span>Status</span>
        <select data-field="status">
          ${statuses.map((status) => `<option value="${status}" ${booking.status === status ? "selected" : ""}>${status.replace("_", " ")}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Payment</span>
        <select data-field="payment_status">
          ${paymentStatuses.map((status) => `<option value="${status}" ${booking.payment_status === status ? "selected" : ""}>${status.replace("_", " ")}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Assigned to</span>
        <input data-field="assigned_to" value="${escapeAttribute(booking.assigned_to || "")}" placeholder="Team member">
      </label>
      <label>
        <span>Private notes</span>
        <textarea data-field="private_notes" placeholder="Internal notes">${escapeHtml(booking.private_notes || "")}</textarea>
      </label>
      <button class="primary-button" type="button" data-save>Save changes</button>
      ${options.hideAccept ? "" : '<button class="secondary-button" type="button" data-accept>Accept</button>'}
      <button class="secondary-button" type="button" data-decline>Decline</button>
      ${canCapturePayment && booking.payment_intent_id ? '<button class="secondary-button" type="button" data-capture>Capture payment</button>' : ""}
    </div>
  `;
}

function renderTimeOptions(currentValue) {
  const values = currentValue && !adminTimeOptions.includes(currentValue)
    ? [currentValue, ...adminTimeOptions]
    : adminTimeOptions;
  return [`<option value="" ${currentValue ? "" : "selected"}>Select time</option>`]
    .concat(values.map((value) => `<option value="${escapeAttribute(value)}" ${currentValue === value ? "selected" : ""}>${escapeHtml(value)}</option>`))
    .join("");
}

function vehicleSizeDisplay(value) {
  return vehicleSizeOptions.find((option) => option.value === value)?.label || value || "Not set";
}

function renderBackendRecords(booking) {
  const customer = booking.customer_record;
  const vehicle = booking.vehicle_record;
  const location = booking.location_record;
  const job = booking.job_record;

  return `
    <div class="backend-records">
      <div>
        <span>Customer record</span>
        <strong>${escapeHtml(customer?.name || booking.customer_name || "Missing")}</strong>
        <p>${escapeHtml(recordStatus(customer))}</p>
      </div>
      <div>
        <span>Vehicle record</span>
        <strong>${escapeHtml([vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "Missing")}</strong>
        <p>${escapeHtml(recordStatus(vehicle))}</p>
      </div>
      <div>
        <span>Location record</span>
        <strong>${escapeHtml(location?.address || booking.service_address || "Missing")}</strong>
        <p>${escapeHtml(recordStatus(location))}</p>
      </div>
      <div>
        <span>Job record</span>
        <strong>${escapeHtml(job?.status || booking.status || "Missing")}</strong>
        <p>${escapeHtml(recordStatus(job))}</p>
      </div>
    </div>
  `;
}

function recordStatus(record) {
  return record?.id ? "Linked in backend" : "Not linked yet";
}

function googleMapsUrl(address) {
  const value = String(address || "").trim();
  return value ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}` : "";
}

function moneyValue(value) {
  const match = String(value || "").match(/\d+(?:\.\d{1,2})?/);
  const numeric = Number(match?.[0] || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function addOnTotal(addOns) {
  return String(addOns || "")
    .split(",")
    .reduce((sum, item) => sum + moneyValue(item), 0);
}

function pricingSummary(booking) {
  const savedTotal = moneyValue(booking.starting_price);
  const addOns = addOnTotal(booking.add_ons);
  const includesTotalBreakdown = /total/i.test(String(booking.starting_price || ""));
  const primaryMatch = String(booking.starting_price || "").match(/\$(\d+(?:\.\d{1,2})?) primary/i);
  const packageOnly = primaryMatch ? Number(primaryMatch[1]) : includesTotalBreakdown ? Math.max(savedTotal - addOns, 0) || savedTotal : savedTotal;
  const total = includesTotalBreakdown ? savedTotal : packageOnly + addOns;
  return {
    packageLabel: packageOnly ? `$${packageOnly}` : booking.starting_price || "Not set",
    addOnsLabel: addOns ? `$${addOns} add-ons` : "No add-ons selected",
    totalLabel: total ? `$${total}` : booking.starting_price || "Not set"
  };
}

function shortReference(value) {
  const text = String(value || "");
  if (!text) return "";
  return text.length > 18 ? `${text.slice(0, 12)}...` : text;
}

function renderStats(bookings) {
  const pending = pendingBookings(allBookings).length;
  const scheduled = scheduledBookings(allBookings).length;
  const completed = allBookings.filter((booking) => booking.status === "complete").length;
  const paymentPending = allBookings.filter((booking) => ["pending", "requires_capture"].includes(booking.payment_status)).length;

  adminStats.innerHTML = [
    ["Pending", pending, "pending"],
    ["Accepted", scheduled, "accepted"],
    ["Complete", completed, "complete"],
    ["Payment pending", paymentPending, "payments"]
  ].map(([label, value, target]) => `
    <button class="stat-card" type="button" data-stat-target="${target}">
      <span>${label}</span>
      <strong>${value}</strong>
    </button>
  `).join("");

  adminStats.querySelectorAll("[data-stat-target]").forEach((button) => {
    button.addEventListener("click", () => openStatTarget(button.dataset.statTarget));
  });
}

function openStatTarget(target) {
  if (target === "payments") {
    window.location.href = "admin-payments.html";
    return;
  }
  if (target === "accepted") {
    scheduleQueue?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (target === "complete") {
    customerSearchInput.value = "complete";
    renderBookings(allBookings.filter((booking) => booking.status === "complete"));
    customerSearchStatus.textContent = "Showing completed requests.";
    adminBookings.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  customerSearchInput.value = "";
  renderFilteredBookings();
  pendingHeading?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveBooking(card) {
  const id = card.dataset.id;
  const payload = { id };
  card.querySelectorAll("[data-field]").forEach((field) => {
    payload[field.dataset.field] = field.value;
  });

  const button = card.querySelector("[data-save]");
  button.textContent = "Saving...";
  try {
    const data = await api("update-booking", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    if (data.customer_notification?.ok) {
      adminActionStatus.textContent = "Changes saved and the customer received an updated text message.";
      button.textContent = "Saved + texted";
    } else if (data.customer_notification && data.customer_notification.ok === false) {
      adminActionStatus.textContent = `Changes saved, but customer text failed: ${data.customer_notification.message}`;
      button.textContent = "Saved";
    } else {
      adminActionStatus.textContent = "Changes saved.";
      button.textContent = "Saved";
    }
    await loadBookings();
  } catch (error) {
    button.textContent = error.message;
    adminActionStatus.textContent = error.message;
  }
}

async function quickUpdateBooking(card, status) {
  const button = card.querySelector(status === "scheduled" ? "[data-accept]" : "[data-decline]");
  button.textContent = status === "scheduled" ? "Accepting..." : "Declining...";
  try {
    await api("update-booking", {
      method: "PATCH",
      body: JSON.stringify({ id: card.dataset.id, status })
    });
    button.textContent = status === "scheduled" ? "Accepted" : "Declined";
    await loadBookings();
  } catch (error) {
    button.textContent = error.message;
  }
}

async function capturePayment(card) {
  const id = card.dataset.id;
  const paymentIntentId = card.dataset.paymentIntentId;
  if (!paymentIntentId) return;

  const button = card.querySelector("[data-capture]");
  button.textContent = "Capturing...";
  try {
    const data = await api("capture-payment", {
      method: "POST",
      body: JSON.stringify({ id, payment_intent_id: paymentIntentId })
    });
    button.textContent = "Captured";
    if (data.receipt) sessionStorage.setItem(LAST_RECEIPT_KEY, JSON.stringify(data.receipt));
    window.location.href = `capture-success.html?booking_id=${encodeURIComponent(id)}`;
  } catch (error) {
    button.textContent = error.message;
  }
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatPhone(value) {
  const phone = String(value || "").replace(/\D/g, "");
  if (phone.length !== 10) return value;
  return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

bootstrapAdmin();

async function bootstrapAdmin() {
  if (token() && sessionIsValid()) {
    setLoggedIn(true);
    await loadHealth();
    if (hasAdminRole(["admin"])) await loadAdminUsers();
    await loadActivity();
    await loadBookings();
    renderMembers();
    startBookingPolling();
    await ensureAdminPushSubscription();
  } else {
    if (token()) {
      clearAdminSession("Admin session expired. Log in again.");
    } else {
      setLoggedIn(false);
    }
  }
}
