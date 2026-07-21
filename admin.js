const ADMIN_TOKEN_KEY = "legendary.admin.token";
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

const statuses = ["new", "contacted", "scheduled", "in_progress", "complete", "canceled"];
const paymentStatuses = ["not_started", "pending", "requires_capture", "succeeded", "canceled", "failed"];
const backendSetupLinks = {
  netlify: "https://app.netlify.com/sites/legendaryautospa/configuration/env",
  supabase: "https://supabase.com/dashboard/projects",
  twilio: "https://console.twilio.com/us1/develop/phone-numbers/manage/incoming",
  stripe: "https://dashboard.stripe.com/apikeys",
  stripeWebhooks: "https://dashboard.stripe.com/webhooks",
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
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  setLoggedIn(false);
  adminPassword.value = "";
  adminStatus.textContent = message;
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
    startBookingPolling();
  } catch (error) {
    adminStatus.textContent = error.message;
  }
});

refreshBookingsButton.addEventListener("click", async () => {
  await loadHealth();
  if (hasAdminRole(["admin"])) await loadAdminUsers();
  await loadActivity();
  await loadBookings();
});

logoutButton.addEventListener("click", () => {
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

async function loadBookings() {
  adminBookings.innerHTML = '<p class="empty-state">Loading bookings...</p>';
  try {
    const data = await api("admin-bookings");
    const nextBookings = data.bookings || [];
    notifyNewBookings(nextBookings);
    allBookings = nextBookings;
    renderFilteredBookings();
  } catch (error) {
    adminBookings.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

async function requestAdminNotificationPermission() {
  if (!("Notification" in window)) {
    adminActionStatus.textContent = "Browser alerts are not supported in this browser.";
    return;
  }

  const permission = await Notification.requestPermission();
  adminActionStatus.textContent = permission === "granted"
    ? "Admin browser alerts are enabled while this dashboard is open."
    : "Admin browser alerts were not enabled.";
}

function notifyNewBookings(bookings) {
  const ids = new Set(bookings.map((booking) => booking.id).filter(Boolean));
  if (!bookingsLoadedOnce) {
    seenBookingIds = ids;
    bookingsLoadedOnce = true;
    return;
  }

  const newBookings = bookings.filter((booking) => booking.id && !seenBookingIds.has(booking.id));
  seenBookingIds = ids;
  if (!newBookings.length || !("Notification" in window) || Notification.permission !== "granted") return;

  newBookings.forEach((booking) => {
    new Notification("New Legendary Auto Spa request", {
      body: `${booking.customer_name || "Customer"} requested ${booking.service_tier || "a detail"} for ${booking.preferred_date || "a new date"}.`,
      icon: "assets/icon.svg",
      tag: `booking-${booking.id}`
    });
  });
}

function startBookingPolling() {
  if (bookingPollTimer) return;
  bookingPollTimer = window.setInterval(() => {
    if (dashboardPanel.classList.contains("hidden")) return;
    loadBookings();
  }, 45000);
}

function renderFilteredBookings() {
  const query = String(customerSearchInput?.value || "").trim().toLowerCase();
  const bookings = query
    ? allBookings.filter((booking) => bookingMatchesQuery(booking, query))
    : allBookings;

  if (customerSearchStatus) {
    customerSearchStatus.textContent = query
      ? `Showing ${bookings.length} of ${allBookings.length} matching booking${bookings.length === 1 ? "" : "s"}.`
      : "Showing all booking history.";
  }

  renderBookings(bookings);
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
    booking.service_tier
  ].some((value) => String(value || "").toLowerCase().includes(query));
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

  if (details.payment_intent_id) return `PaymentIntent: ${details.payment_intent_id}`;
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
  if (key.includes("stripe_webhook") || label.includes("webhook")) {
    return { href: backendSetupLinks.stripeWebhooks, label: "Open Stripe webhooks" };
  }
  if (key.includes("stripe") || label.includes("stripe") || label.includes("payment")) {
    return { href: backendSetupLinks.stripe, label: "Open Stripe payments" };
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
    adminBookings.innerHTML = '<p class="empty-state">No requests yet.</p>';
    return;
  }

  const canUpdateBookings = hasAdminRole(["admin", "manager"]);
  const canCapturePayment = hasAdminRole(["admin"]);
  adminBookings.innerHTML = bookings.map((booking) => {
    const pricing = pricingSummary(booking);
    const mapsUrl = googleMapsUrl(booking.service_address);
    return `
    <article class="admin-booking" data-id="${escapeAttribute(booking.id || "")}" data-payment-intent-id="${escapeAttribute(booking.payment_intent_id || "")}">
      <div class="booking-head">
        <div>
          <h3><button class="customer-history-button" type="button" data-customer-history="${escapeAttribute(customerHistoryQuery(booking))}">${escapeHtml(booking.customer_name || "Customer")}</button></h3>
          <p>${escapeHtml(booking.phone || "")} ${booking.email ? `· ${escapeHtml(booking.email)}` : ""}</p>
        </div>
        <span class="status-pill">${escapeHtml(booking.status || "new")}</span>
      </div>

      <div class="booking-meta">
        <div><span>Package</span><strong>${escapeHtml(booking.service_tier)}</strong><p>${escapeHtml(pricing.packageLabel)}</p></div>
        <div><span>Vehicle</span><strong>${escapeHtml([booking.vehicle_year, booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" "))}</strong><p>${escapeHtml(booking.vehicle_size)}</p></div>
        <div><span>Focus</span><strong>${escapeHtml(booking.focus_area)}</strong><p>${escapeHtml(booking.focus_goal)}</p></div>
        <div><span>Add-ons</span><strong>${escapeHtml(booking.add_ons || "None")}</strong><p>${escapeHtml(pricing.addOnsLabel)}</p></div>
        <div><span>Estimated total</span><strong>${escapeHtml(pricing.totalLabel)}</strong><p>Package plus selected add-ons</p></div>
        <div><span>Schedule</span><strong>${escapeHtml(booking.preferred_date)}</strong><p>${escapeHtml(booking.preferred_time)}</p></div>
        <div><span>Location</span><strong>${escapeHtml(booking.service_address)}</strong><p>${escapeHtml(booking.notes)}</p>${mapsUrl ? `<a href="${escapeAttribute(mapsUrl)}" target="_blank" rel="noopener">Open in Google Maps</a>` : ""}</div>
        <div><span>Payment</span><strong>${escapeHtml(booking.payment_preference)}</strong><p>${escapeHtml(booking.payment_status)}</p></div>
        <div><span>Assigned</span><strong>${escapeHtml(booking.assigned_to || "Unassigned")}</strong><p>${formatDate(booking.created_at)}</p></div>
        <div><span>Stripe</span><strong>${escapeHtml(shortReference(booking.payment_intent_id) || "None")}</strong><p>${escapeHtml(booking.recommended_tier || "")}</p></div>
      </div>

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

function renderBookingControls(booking, canUpdateBookings, canCapturePayment) {
  if (!canUpdateBookings) {
    return '<p class="empty-state permission-note">Viewer access: booking details are read-only.</p>';
  }

  return `
    <div class="booking-controls">
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
      <button class="secondary-button" type="button" data-accept>Accept</button>
      <button class="secondary-button" type="button" data-decline>Decline</button>
      ${canCapturePayment && booking.payment_intent_id ? '<button class="secondary-button" type="button" data-capture>Capture payment</button>' : ""}
    </div>
  `;
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
  const newCount = bookings.filter((booking) => booking.status === "new").length;
  const scheduled = bookings.filter((booking) => booking.status === "scheduled").length;
  const completed = bookings.filter((booking) => booking.status === "complete").length;
  const paymentPending = bookings.filter((booking) => ["pending", "requires_capture"].includes(booking.payment_status)).length;

  adminStats.innerHTML = [
    ["New", newCount],
    ["Scheduled", scheduled],
    ["Complete", completed],
    ["Payment pending", paymentPending]
  ].map(([label, value]) => `
    <div class="stat-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
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
    await api("update-booking", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    button.textContent = "Saved";
    await loadBookings();
  } catch (error) {
    button.textContent = error.message;
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
    await api("capture-payment", {
      method: "POST",
      body: JSON.stringify({ id, payment_intent_id: paymentIntentId })
    });
    button.textContent = "Captured";
    await loadBookings();
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

if (token() && sessionIsValid()) {
  setLoggedIn(true);
  loadHealth();
  if (hasAdminRole(["admin"])) loadAdminUsers();
  loadActivity();
  loadBookings();
  startBookingPolling();
} else {
  if (token()) {
    clearAdminSession("Admin session expired. Log in again.");
  } else {
    setLoggedIn(false);
  }
}
