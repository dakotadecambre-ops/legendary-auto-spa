const MEMBER_SESSION_KEY = "legendary-auto-spa.memberSession";
const MEMBER_TOKEN_KEY = "legendary-auto-spa.memberToken";
const MEMBER_PROFILE_KEY = "legendary-auto-spa.memberProfile";
const REQUESTS_KEY = "legendary-auto-spa.requests";
const REBOOK_KEY = "legendary-auto-spa.rebookRequest";

const memberDashboard = document.querySelector("#memberDashboard");
const memberTitle = document.querySelector("#memberTitle");
const memberLogoutButton = document.querySelector("#memberLogoutButton");
const memberVehicles = document.querySelector("#memberVehicles");
const memberLocations = document.querySelector("#memberLocations");
const memberRequests = document.querySelector("#memberRequests");
const memberVehiclesPanel = document.querySelector("#memberVehiclesPanel");
const memberRequestsPanel = document.querySelector("#memberRequestsPanel");
const memberTabs = [...document.querySelectorAll("[data-member-tab]")];

let currentMember = null;
let currentRequests = [];

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function memberToken() {
  return localStorage.getItem(MEMBER_TOKEN_KEY) || "";
}

function activePhone() {
  return localStorage.getItem(MEMBER_SESSION_KEY) || "";
}

function cachedProfile() {
  try {
    return JSON.parse(localStorage.getItem(MEMBER_PROFILE_KEY)) || null;
  } catch {
    return null;
  }
}

function readLocalRequests() {
  try {
    return JSON.parse(localStorage.getItem(REQUESTS_KEY)) || [];
  } catch {
    return [];
  }
}

async function memberApi(path, options = {}) {
  const result = await fetch(`/.netlify/functions/${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: memberToken() ? `Bearer ${memberToken()}` : "",
      ...(options.headers || {})
    }
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(data.error || "Request failed");
  return data;
}

function clearMemberSession() {
  localStorage.removeItem(MEMBER_TOKEN_KEY);
  localStorage.removeItem(MEMBER_SESSION_KEY);
  localStorage.removeItem(MEMBER_PROFILE_KEY);
  currentMember = null;
  currentRequests = [];
}

async function loadPortal() {
  if (!memberToken()) {
    window.location.href = "member.html";
    return;
  }

  currentMember = currentMember || cachedProfile();
  renderMemberDashboard();
  try {
    const data = await memberApi("member-profile");
    currentMember = data.member;
    currentRequests = data.requests || [];
    localStorage.setItem(MEMBER_PROFILE_KEY, JSON.stringify(currentMember || {}));
    localStorage.setItem(MEMBER_SESSION_KEY, currentMember?.phone || activePhone());
    renderMemberDashboard();
  } catch (error) {
    if (currentMember) {
      renderMemberDashboard();
      return;
    }
    clearMemberSession();
    window.location.href = "member.html";
  }
}

function renderMemberDashboard() {
  const account = currentMember || cachedProfile();
  if (!(account && memberToken())) {
    window.location.href = "member.html";
    return;
  }

  memberTitle.textContent = account.name ? `${account.name}'s portal` : `Member ${formatPhone(account.phone)}`;
  renderVehicles(account.vehicles || []);
  renderLocations(account.locations || []);
  renderRequests();
}

function renderVehicles(vehicles) {
  if (!vehicles.length) {
    memberVehicles.innerHTML = '<p class="empty-state">No saved vehicles yet. Add one in Settings or save one while booking.</p>';
    return;
  }

  memberVehicles.innerHTML = vehicles.map((vehicle) => `
    <article class="request-item">
      <strong>${escapeHtml([vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Saved vehicle")}</strong>
      <p>${escapeHtml(vehicle.size || "Vehicle")} · ${escapeHtml(vehicle.tier || "No package saved")}</p>
      <button class="secondary-button full-width" type="button" data-rebook-vehicle='${escapeAttribute(JSON.stringify(vehicle))}'>Request this vehicle</button>
    </article>
  `).join("");
}

function renderLocations(locations) {
  if (!locations.length) {
    memberLocations.innerHTML = '<p class="empty-state">No saved locations yet. Add one in Settings.</p>';
    return;
  }

  memberLocations.innerHTML = locations.map((location) => `
    <article class="request-item">
      <strong>${escapeHtml(location.label || "Saved location")}</strong>
      <p>${escapeHtml(location.address || "No address")}</p>
    </article>
  `).join("");
}

function renderRequests() {
  const phone = activePhone();
  const backendRequests = currentRequests.map(normalizeBackendRequest);
  const localRequests = readLocalRequests().filter((request) => normalizePhone(request.phone) === phone);
  const requests = [...backendRequests, ...localRequests].slice(0, 25);
  if (!requests.length) {
    memberRequests.innerHTML = '<p class="empty-state">No recent requests found for this phone yet.</p>';
    return;
  }

  memberRequests.innerHTML = requests.map((request) => `
    <article class="request-item">
      <strong>${escapeHtml(request.tier || "Detail request")}</strong>
      <p>${escapeHtml([request.year, request.make, request.model].filter(Boolean).join(" ") || "Vehicle")} · ${escapeHtml(request.startingPrice || "No total")}</p>
      <p>${escapeHtml(request.date || "No date")} · ${escapeHtml(request.time || "No time")}</p>
      <button class="primary-button full-width" type="button" data-rebook-request='${escapeAttribute(JSON.stringify(request))}'>Re-request this wash</button>
    </article>
  `).join("");
}

function normalizeBackendRequest(request) {
  return {
    name: request.customer_name || currentMember?.name || "",
    phone: request.phone || currentMember?.phone || "",
    email: request.email || currentMember?.email || "",
    year: request.vehicle_year || "",
    make: request.vehicle_make || "",
    model: request.vehicle_model || "",
    size: request.vehicle_size || "",
    tier: request.service_tier || "",
    startingPrice: request.starting_price || "",
    focusArea: request.focus_area || "",
    focusGoal: request.focus_goal || "",
    addOns: request.add_ons || "",
    address: request.service_address || "",
    date: request.preferred_date || "",
    time: request.preferred_time || "",
    notes: request.notes || "",
    paymentPreference: request.payment_preference || "",
    paymentStatus: request.payment_status || "",
    bookingReference: request.id ? request.id.slice(0, 8).toUpperCase() : "",
    createdAt: request.created_at || new Date().toISOString()
  };
}

function setActiveTab(tabName) {
  memberTabs.forEach((tabButton) => tabButton.classList.toggle("active", tabButton.dataset.memberTab === tabName));
  memberVehiclesPanel.classList.toggle("hidden", tabName !== "vehicles");
  memberRequestsPanel.classList.toggle("hidden", tabName !== "requests");
}

function rebook(request) {
  sessionStorage.setItem(REBOOK_KEY, JSON.stringify(request));
  window.location.href = "rebook-confirm.html";
}

function startVehicleRequest(request) {
  sessionStorage.setItem(REBOOK_KEY, JSON.stringify(request));
  window.location.href = "index.html?rebook=1#booking";
}

function formatPhone(value) {
  const phone = normalizePhone(value);
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

memberLogoutButton.addEventListener("click", () => {
  clearMemberSession();
  window.location.href = "member.html";
});

memberTabs.forEach((tabButton) => {
  tabButton.addEventListener("click", () => setActiveTab(tabButton.dataset.memberTab));
});

memberDashboard.addEventListener("click", (event) => {
  const vehicleButton = event.target.closest("[data-rebook-vehicle]");
  const requestButton = event.target.closest("[data-rebook-request]");
  if (vehicleButton) {
    const vehicle = JSON.parse(vehicleButton.dataset.rebookVehicle);
    startVehicleRequest({
      phone: activePhone(),
      name: currentMember?.name || "",
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      size: vehicle.size,
      tier: vehicle.tier
    });
  }
  if (requestButton) {
    rebook(JSON.parse(requestButton.dataset.rebookRequest));
  }
});

loadPortal();
