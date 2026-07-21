const MEMBER_ACCOUNTS_KEY = "legendary-auto-spa.memberAccounts";
const MEMBER_SESSION_KEY = "legendary-auto-spa.memberSession";
const REQUESTS_KEY = "legendary-auto-spa.requests";
const REBOOK_KEY = "legendary-auto-spa.rebookRequest";

const memberAuthPanel = document.querySelector("#memberAuthPanel");
const memberDashboard = document.querySelector("#memberDashboard");
const memberAuthForm = document.querySelector("#memberAuthForm");
const createMemberButton = document.querySelector("#createMemberButton");
const memberPhone = document.querySelector("#memberPhone");
const memberPassword = document.querySelector("#memberPassword");
const memberStatus = document.querySelector("#memberStatus");
const memberTitle = document.querySelector("#memberTitle");
const memberLogoutButton = document.querySelector("#memberLogoutButton");
const memberVehicles = document.querySelector("#memberVehicles");
const memberRequests = document.querySelector("#memberRequests");
const memberVehiclesPanel = document.querySelector("#memberVehiclesPanel");
const memberRequestsPanel = document.querySelector("#memberRequestsPanel");
const memberTabs = [...document.querySelectorAll("[data-member-tab]")];

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function readAccounts() {
  try {
    return JSON.parse(localStorage.getItem(MEMBER_ACCOUNTS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(MEMBER_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function readRequests() {
  try {
    return JSON.parse(localStorage.getItem(REQUESTS_KEY)) || [];
  } catch {
    return [];
  }
}

function activePhone() {
  return localStorage.getItem(MEMBER_SESSION_KEY) || "";
}

function activeAccount() {
  const phone = activePhone();
  return phone ? readAccounts()[phone] || null : null;
}

function setSignedIn(phone) {
  localStorage.setItem(MEMBER_SESSION_KEY, phone);
  renderMemberDashboard();
}

function createAccount() {
  const phone = normalizePhone(memberPhone.value);
  const password = memberPassword.value;
  if (phone.length < 10 || password.length < 6) {
    memberStatus.textContent = "Enter a valid phone number and a password with at least 6 characters.";
    return;
  }
  const accounts = readAccounts();
  if (accounts[phone] && accounts[phone].password !== password) {
    memberStatus.textContent = "That phone already has an account. Sign in with the existing password.";
    return;
  }
  if (!accounts[phone]) {
    accounts[phone] = { phone, password, vehicles: [], createdAt: new Date().toISOString() };
    saveAccounts(accounts);
  }
  setSignedIn(phone);
}

function signIn(event) {
  event.preventDefault();
  const phone = normalizePhone(memberPhone.value);
  const account = readAccounts()[phone];
  if (!account || account.password !== memberPassword.value) {
    memberStatus.textContent = "No matching member account found. Create an account first or check the password.";
    return;
  }
  setSignedIn(phone);
}

function renderMemberDashboard() {
  const account = activeAccount();
  memberAuthPanel.classList.toggle("hidden", Boolean(account));
  memberDashboard.classList.toggle("hidden", !account);
  if (!account) return;

  memberTitle.textContent = `Member ${formatPhone(account.phone)}`;
  renderVehicles(account.vehicles || []);
  renderRequests();
}

function renderVehicles(vehicles) {
  if (!vehicles.length) {
    memberVehicles.innerHTML = '<p class="empty-state">No saved vehicles yet. Book a wash and choose “Save this vehicle” to add one.</p>';
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

function renderRequests() {
  const phone = activePhone();
  const requests = readRequests().filter((request) => normalizePhone(request.phone) === phone);
  if (!requests.length) {
    memberRequests.innerHTML = '<p class="empty-state">No recent requests found for this phone on this device.</p>';
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

function setActiveTab(tabName) {
  memberTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.memberTab === tabName));
  memberVehiclesPanel.classList.toggle("hidden", tabName !== "vehicles");
  memberRequestsPanel.classList.toggle("hidden", tabName !== "requests");
}

function rebook(request) {
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

memberAuthForm.addEventListener("submit", signIn);
createMemberButton.addEventListener("click", createAccount);
memberLogoutButton.addEventListener("click", () => {
  localStorage.removeItem(MEMBER_SESSION_KEY);
  renderMemberDashboard();
});

memberTabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.memberTab));
});

memberDashboard.addEventListener("click", (event) => {
  const vehicleButton = event.target.closest("[data-rebook-vehicle]");
  const requestButton = event.target.closest("[data-rebook-request]");
  if (vehicleButton) {
    const vehicle = JSON.parse(vehicleButton.dataset.rebookVehicle);
    rebook({
      phone: activePhone(),
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

renderMemberDashboard();
