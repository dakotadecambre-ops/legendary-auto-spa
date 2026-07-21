const MEMBER_ACCOUNTS_KEY = "legendary-auto-spa.memberAccounts";
const MEMBER_SESSION_KEY = "legendary-auto-spa.memberSession";

const memberProfileForm = document.querySelector("#memberProfileForm");
const settingsTitle = document.querySelector("#settingsTitle");
const settingsVehicles = document.querySelector("#settingsVehicles");
const settingsLocations = document.querySelector("#settingsLocations");
const settingsStatus = document.querySelector("#settingsStatus");
const addSettingsVehicleButton = document.querySelector("#addSettingsVehicleButton");
const addSettingsLocationButton = document.querySelector("#addSettingsLocationButton");

let draftVehicles = [];
let draftLocations = [];

function activePhone() {
  return localStorage.getItem(MEMBER_SESSION_KEY) || "";
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

function activeAccount() {
  const phone = activePhone();
  return phone ? readAccounts()[phone] || null : null;
}

function renderSettings() {
  const account = activeAccount();
  if (!account) {
    window.location.href = "member.html";
    return;
  }

  memberProfileForm.elements.name.value = account.name || "";
  settingsTitle.textContent = account.name ? `${account.name}'s settings` : "Member settings";
  draftVehicles = [...(account.vehicles || [])];
  draftLocations = [...(account.locations || [])];
  renderVehicles();
  renderLocations();
}

function renderVehicles() {
  settingsVehicles.innerHTML = draftVehicles.length ? draftVehicles.map((vehicle, index) => `
    <article class="additional-vehicle-card" data-vehicle-index="${index}">
      <div class="section-inline-heading">
        <span>Vehicle ${index + 1}</span>
        <button class="ghost-button compact-button" type="button" data-remove-vehicle>Remove</button>
      </div>
      <div class="grid-two">
        <label>Year<input data-field="year" value="${escapeAttribute(vehicle.year || "")}" placeholder="2022"></label>
        <label>Make<input data-field="make" value="${escapeAttribute(vehicle.make || "")}" placeholder="Toyota"></label>
      </div>
      <div class="grid-two">
        <label>Model<input data-field="model" value="${escapeAttribute(vehicle.model || "")}" placeholder="Camry"></label>
        <label>
          Vehicle class
          <select data-field="size">
            ${["Car / Sedan / Coupe", "SUV / Crossover", "Truck / Large SUV"].map((size) => `<option ${vehicle.size === size ? "selected" : ""}>${size}</option>`).join("")}
          </select>
        </label>
      </div>
    </article>
  `).join("") : '<p class="empty-state">No saved vehicles yet.</p>';
}

function renderLocations() {
  settingsLocations.innerHTML = draftLocations.length ? draftLocations.map((location, index) => `
    <article class="additional-vehicle-card" data-location-index="${index}">
      <div class="section-inline-heading">
        <span>Location ${index + 1}</span>
        <button class="ghost-button compact-button" type="button" data-remove-location>Remove</button>
      </div>
      <label>Label<input data-field="label" value="${escapeAttribute(location.label || "")}" placeholder="Home"></label>
      <label>Address<input data-field="address" value="${escapeAttribute(location.address || "")}" placeholder="Street, city, state"></label>
    </article>
  `).join("") : '<p class="empty-state">No saved locations yet.</p>';
}

function saveSettings(event) {
  event.preventDefault();
  const phone = activePhone();
  const accounts = readAccounts();
  const account = accounts[phone];
  if (!account) return;

  accounts[phone] = {
    ...account,
    name: memberProfileForm.elements.name.value.trim(),
    vehicles: draftVehicles,
    locations: draftLocations,
    updatedAt: new Date().toISOString()
  };
  saveAccounts(accounts);
  settingsStatus.textContent = "Settings saved.";
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

addSettingsVehicleButton.addEventListener("click", () => {
  draftVehicles.push({ year: "", make: "", model: "", size: "Car / Sedan / Coupe", tier: "", savedAt: new Date().toISOString() });
  renderVehicles();
});

addSettingsLocationButton.addEventListener("click", () => {
  draftLocations.push({ label: "New location", address: "", savedAt: new Date().toISOString() });
  renderLocations();
});

settingsVehicles.addEventListener("input", (event) => {
  const card = event.target.closest("[data-vehicle-index]");
  if (!card || !event.target.dataset.field) return;
  draftVehicles[Number(card.dataset.vehicleIndex)][event.target.dataset.field] = event.target.value;
});

settingsVehicles.addEventListener("change", (event) => {
  const card = event.target.closest("[data-vehicle-index]");
  if (!card || !event.target.dataset.field) return;
  draftVehicles[Number(card.dataset.vehicleIndex)][event.target.dataset.field] = event.target.value;
});

settingsVehicles.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-vehicle]");
  if (!button) return;
  draftVehicles.splice(Number(button.closest("[data-vehicle-index]").dataset.vehicleIndex), 1);
  renderVehicles();
});

settingsLocations.addEventListener("input", (event) => {
  const card = event.target.closest("[data-location-index]");
  if (!card || !event.target.dataset.field) return;
  draftLocations[Number(card.dataset.locationIndex)][event.target.dataset.field] = event.target.value;
});

settingsLocations.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-location]");
  if (!button) return;
  draftLocations.splice(Number(button.closest("[data-location-index]").dataset.locationIndex), 1);
  renderLocations();
});

memberProfileForm.addEventListener("submit", saveSettings);
renderSettings();
