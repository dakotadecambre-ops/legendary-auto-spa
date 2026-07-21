const MEMBER_SESSION_KEY = "legendary-auto-spa.memberSession";
const MEMBER_TOKEN_KEY = "legendary-auto-spa.memberToken";
const MEMBER_PROFILE_KEY = "legendary-auto-spa.memberProfile";

const memberProfileForm = document.querySelector("#memberProfileForm");
const settingsTitle = document.querySelector("#settingsTitle");
const settingsVehicles = document.querySelector("#settingsVehicles");
const settingsLocations = document.querySelector("#settingsLocations");
const settingsStatus = document.querySelector("#settingsStatus");
const addSettingsVehicleButton = document.querySelector("#addSettingsVehicleButton");
const addSettingsLocationButton = document.querySelector("#addSettingsLocationButton");

let currentMember = null;
let draftVehicles = [];
let draftLocations = [];

function memberToken() {
  return localStorage.getItem(MEMBER_TOKEN_KEY) || "";
}

function cachedProfile() {
  try {
    return JSON.parse(localStorage.getItem(MEMBER_PROFILE_KEY)) || null;
  } catch {
    return null;
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

async function loadSettings() {
  if (!memberToken()) {
    window.location.href = "member.html";
    return;
  }

  currentMember = cachedProfile();
  if (currentMember) hydrateSettings(currentMember);

  try {
    const data = await memberApi("member-profile");
    currentMember = data.member;
    localStorage.setItem(MEMBER_PROFILE_KEY, JSON.stringify(currentMember || {}));
    localStorage.setItem(MEMBER_SESSION_KEY, currentMember?.phone || "");
    hydrateSettings(currentMember);
  } catch (error) {
    if (!currentMember) {
      settingsStatus.textContent = error.message;
      window.setTimeout(() => {
        window.location.href = "member.html";
      }, 1200);
      return;
    }
    settingsStatus.textContent = "Showing saved settings. Live member sync needs the backend deploy to finish.";
  }
}

function hydrateSettings(account) {
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

async function saveSettings(event) {
  event.preventDefault();
  if (!currentMember) return;

  settingsStatus.textContent = "Saving settings...";
  try {
    const data = await memberApi("member-profile", {
      method: "PATCH",
      body: JSON.stringify({
        name: memberProfileForm.elements.name.value.trim(),
        email: currentMember.email || "",
        vehicles: draftVehicles,
        locations: draftLocations
      })
    });
    currentMember = data.member;
    localStorage.setItem(MEMBER_PROFILE_KEY, JSON.stringify(currentMember || {}));
    settingsStatus.textContent = "Settings saved.";
    hydrateSettings(currentMember);
  } catch (error) {
    settingsStatus.textContent = error.message;
  }
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
  draftVehicles.push({ year: "", make: "", model: "", size: "Car / Sedan / Coupe", tier: "" });
  renderVehicles();
});

addSettingsLocationButton.addEventListener("click", () => {
  draftLocations.push({ label: "New location", address: "" });
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
loadSettings();
