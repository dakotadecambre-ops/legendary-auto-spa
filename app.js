const BUSINESS_PHONE = "+12016652625";
const BUSINESS_PHONE_DISPLAY = "201-665-2625";
const REQUESTS_KEY = "legendary-auto-spa.requests";
const MEMBER_ACCOUNTS_KEY = "legendary-auto-spa.memberAccounts";
const MEMBER_SESSION_KEY = "legendary-auto-spa.memberSession";
const MEMBER_TOKEN_KEY = "legendary-auto-spa.memberToken";
const MEMBER_PROFILE_KEY = "legendary-auto-spa.memberProfile";
const REBOOK_KEY = "legendary-auto-spa.rebookRequest";

const form = document.querySelector("#requestForm");
const tierCards = [...document.querySelectorAll(".tier-card")];
const focusCards = [...document.querySelectorAll(".focus-card")];
const paymentCards = [...document.querySelectorAll(".payment-card")];
const vehicleClassOptions = [...document.querySelectorAll(".vehicle-class-option")];
const vehicleClassInputs = [...document.querySelectorAll("input[name='vehicleClass']")];
const vehicleSizeSelect = form.querySelector("select[name='size']");
const formStartedAtInput = form.querySelector("input[name='formStartedAt']");
const bookingSteps = [...document.querySelectorAll(".booking-step")];
const progressDots = [...document.querySelectorAll(".progress-dot")];
const bookingShell = document.querySelector("#booking");
const splashScreen = document.querySelector("#splashScreen");
const summaryTier = document.querySelector("#summaryTier");
const summaryPrice = document.querySelector("#summaryPrice");
const summaryFocus = document.querySelector("#summaryFocus");
const paymentSummaryTier = document.querySelector("#paymentSummaryTier");
const paymentSummaryPrice = document.querySelector("#paymentSummaryPrice");
const summaryPayment = document.querySelector("#summaryPayment");
const recommendedTier = document.querySelector("#recommendedTier");
const recommendationReason = document.querySelector("#recommendationReason");
const applyRecommendationButton = document.querySelector("#applyRecommendationButton");
const focusAreaInput = document.querySelector("#focusAreaInput");
const focusGoalInput = document.querySelector("#focusGoalInput");
const recommendedTierInput = document.querySelector("#recommendedTierInput");
const statusText = document.querySelector("#formStatus");
const finalStatus = document.querySelector("#finalStatus");
const locateButton = document.querySelector("#locateButton");
const addressInput = document.querySelector("#addressInput");
const saveDraftButton = document.querySelector("#saveDraftButton");
const finalSubmitButton = document.querySelector("#finalSubmitButton");
const squarePanel = document.querySelector("#squarePanel");
const paymentElementContainer = document.querySelector("#paymentElement");
const applePayElementContainer = document.querySelector("#applePayElement");
const authorizePaymentButton = document.querySelector("#authorizePaymentButton");
const requestList = document.querySelector("#requestList");
const historyCount = document.querySelector("#historyCount");
const installButton = document.querySelector("#installButton");
const addVehicleButton = document.querySelector("#addVehicleButton");
const additionalVehiclesList = document.querySelector("#additionalVehiclesList");
const enableCustomerNotificationsButton = document.querySelector("#enableCustomerNotificationsButton");
const customerNotificationStatus = document.querySelector("#customerNotificationStatus");
const saveVehicleCheckbox = document.querySelector("#saveVehicleCheckbox");
const recurringCheckbox = document.querySelector("#recurringCheckbox");
const recurringFrequencyField = document.querySelector("#recurringFrequencyField");
const memberMenu = document.querySelector("#memberMenu");
const preferredTimeSelect = document.querySelector("#preferredTimeSelect");
const secondaryTimeSelect = document.querySelector("#secondaryTimeSelect");
const customTimeField = document.querySelector("#customTimeField");
const secondaryCustomTimeField = document.querySelector("#secondaryCustomTimeField");
const liabilityAcceptance = document.querySelector("#liabilityAcceptance");

let deferredInstallPrompt = null;
let currentStep = 0;
let squarePayments = null;
let squareCard = null;
let squareApplePay = null;
let pendingPaymentBookingId = "";
let additionalVehicles = [];
let pendingConfirmationUrl = "confirmation.html";

const priceDatasetKeys = {
  cars: "priceCars",
  suvs: "priceSuvs",
  trucks: "priceTrucks"
};

const vehicleTypeLabels = {
  cars: "Car / Sedan / Coupe",
  suvs: "SUV / Crossover",
  trucks: "Truck / Large SUV"
};

function goToStep(step) {
  currentStep = Math.max(0, Math.min(step, bookingSteps.length - 1));

  bookingSteps.forEach((panel, index) => {
    panel.classList.toggle("active", index === currentStep);
    panel.classList.toggle("previous", index < currentStep);
    panel.setAttribute("aria-hidden", index === currentStep ? "false" : "true");
  });

  progressDots.forEach((dot, index) => {
    dot.classList.toggle("active", index === currentStep);
    dot.classList.toggle("complete", index < currentStep);
  });

  bookingShell.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getSelectedTier() {
  const selected = document.querySelector("input[name='tier']:checked");
  const vehicleType = getSelectedVehicleType();
  const price = getTierPrice(selected, vehicleType);
  return {
    name: selected.value,
    price,
    displayPrice: vehicleSizeSelect.value ? `$${price}` : `From $${getTierPrice(selected, "cars")}`,
    vehicleType,
    vehicleLabel: vehicleTypeLabels[vehicleType]
  };
}

function getSelectedVehicleType() {
  const selectedClass = document.querySelector("input[name='vehicleClass']:checked");
  return selectedClass?.value || vehicleSizeSelect.value || "cars";
}

function getTierPrice(input, vehicleType) {
  return input.dataset[priceDatasetKeys[vehicleType] || "priceCars"] || input.dataset.priceCars;
}

function moneyValue(value) {
  const match = String(value || "").match(/\d+(?:\.\d{1,2})?/);
  const numeric = Number(match?.[0] || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function selectedAddOns() {
  return [...form.querySelectorAll("input[name='addOns']:checked")].map((input) => ({
    label: input.value,
    amount: moneyValue(input.value)
  }));
}

function tierOptions() {
  return [...document.querySelectorAll("input[name='tier']")].map((input) => ({
    name: input.value,
    prices: {
      cars: moneyValue(input.dataset.priceCars),
      suvs: moneyValue(input.dataset.priceSuvs),
      trucks: moneyValue(input.dataset.priceTrucks)
    }
  }));
}

function additionalVehiclePrice(vehicle) {
  const option = tierOptions().find((tier) => tier.name === vehicle.tier) || tierOptions()[0];
  return option?.prices?.[vehicle.size] || 0;
}

function additionalVehiclesTotal() {
  return additionalVehicles.reduce((sum, vehicle) => sum + additionalVehiclePrice(vehicle), 0);
}

function priceSummary() {
  const tier = getSelectedTier();
  const addOns = selectedAddOns();
  const addOnsTotal = addOns.reduce((sum, addOn) => sum + addOn.amount, 0);
  const packagePrice = moneyValue(tier.price);
  const extraVehiclesTotal = additionalVehiclesTotal();
  const total = packagePrice + extraVehiclesTotal + addOnsTotal;
  const addOnLabel = addOnsTotal > 0 ? ` + $${addOnsTotal} add-ons` : "";
  const vehicleLabel = extraVehiclesTotal > 0 ? ` + $${extraVehiclesTotal} extra vehicles` : "";

  return {
    ...tier,
    packagePrice,
    extraVehiclesTotal,
    addOnsTotal,
    total,
    displayPrice: vehicleSizeSelect.value ? `$${total}${vehicleLabel}${addOnLabel}` : `From $${packagePrice}`,
    startingPrice: total !== packagePrice
      ? `$${total} total ($${packagePrice} primary + $${extraVehiclesTotal} extra vehicles + $${addOnsTotal} add-ons)`
      : `$${packagePrice}`
  };
}

function updateTierSelection() {
  const tier = priceSummary();
  tierCards.forEach((card) => {
    const input = card.querySelector("input");
    card.classList.toggle("selected", input.checked);
    const priceBadge = card.querySelector("[data-tier-price]");
    if (priceBadge) {
      const price = getTierPrice(input, getSelectedVehicleType());
      priceBadge.textContent = vehicleSizeSelect.value ? `$${price}` : `$${getTierPrice(input, "cars")}+`;
    }
  });
  summaryTier.textContent = tier.name;
  summaryPrice.textContent = tier.displayPrice;
  paymentSummaryTier.textContent = tier.name;
  paymentSummaryPrice.textContent = tier.displayPrice;
}

function syncVehicleClass(vehicleType) {
  const nextValue = vehicleType || "cars";
  vehicleSizeSelect.value = nextValue;
  vehicleClassInputs.forEach((input) => {
    input.checked = input.value === nextValue;
  });
  vehicleClassOptions.forEach((option) => {
    const input = option.querySelector("input");
    option.classList.toggle("selected", input.checked);
  });
  updateTierSelection();
}

function renderAdditionalVehicles() {
  if (!additionalVehicles.length) {
    additionalVehiclesList.innerHTML = '<p class="empty-state">No additional vehicles added.</p>';
    updateTierSelection();
    return;
  }

  const tiers = tierOptions();
  additionalVehiclesList.innerHTML = additionalVehicles.map((vehicle, index) => `
    <article class="additional-vehicle-card" data-vehicle-index="${index}">
      <div class="section-inline-heading">
        <span>Vehicle ${index + 2}</span>
        <button class="ghost-button compact-button" type="button" data-remove-vehicle>Remove</button>
      </div>
      <div class="grid-two">
        <label>
          Year
          <input data-extra-field="year" type="number" inputmode="numeric" min="1950" max="2035" value="${escapeAttribute(vehicle.year || "")}" placeholder="2022">
        </label>
        <label>
          Make
          <input data-extra-field="make" type="text" value="${escapeAttribute(vehicle.make || "")}" placeholder="Toyota">
        </label>
      </div>
      <div class="grid-two">
        <label>
          Model
          <input data-extra-field="model" type="text" value="${escapeAttribute(vehicle.model || "")}" placeholder="Camry">
        </label>
        <label>
          Vehicle class
          <select data-extra-field="size">
            ${Object.entries(vehicleTypeLabels).map(([value, label]) => `<option value="${value}" ${vehicle.size === value ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
      </div>
      <label>
        Wash package
        <select data-extra-field="tier">
          ${tiers.map((tier) => `<option value="${escapeAttribute(tier.name)}" ${vehicle.tier === tier.name ? "selected" : ""}>${escapeHtml(tier.name)}</option>`).join("")}
        </select>
      </label>
      <p class="vehicle-price-line">Vehicle price: $${additionalVehiclePrice(vehicle)}</p>
    </article>
  `).join("");

  updateTierSelection();
}

function addAdditionalVehicle() {
  additionalVehicles.push({
    year: "",
    make: "",
    model: "",
    size: getSelectedVehicleType(),
    tier: getSelectedTier().name
  });
  renderAdditionalVehicles();
}

function additionalVehiclesSummary() {
  return additionalVehicles
    .map((vehicle, index) => {
      const vehicleName = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || `Vehicle ${index + 2}`;
      const size = vehicleTypeLabels[vehicle.size] || vehicle.size || "Vehicle";
      return `${index + 2}. ${vehicleName} - ${size} - ${vehicle.tier} ($${additionalVehiclePrice(vehicle)})`;
    })
    .join("; ");
}

function getSelectedFocus() {
  const selected = document.querySelector("input[name='focus']:checked");
  return {
    name: selected.value,
    goal: selected.dataset.goal,
    recommendation: selected.dataset.recommendation
  };
}

function selectTierByName(tierName) {
  const input = [...document.querySelectorAll("input[name='tier']")]
    .find((tierInput) => tierInput.value === tierName);
  if (!input) return;
  input.checked = true;
  updateTierSelection();
}

function updateFocusSelection() {
  const focus = getSelectedFocus();
  focusCards.forEach((card) => {
    const input = card.querySelector("input");
    card.classList.toggle("selected", input.checked);
  });

  summaryFocus.textContent = focus.name;
  recommendedTier.textContent = focus.recommendation;
  recommendationReason.textContent = focus.goal;
  focusAreaInput.value = focus.name;
  focusGoalInput.value = focus.goal;
  recommendedTierInput.value = focus.recommendation;
}

function getSelectedPaymentPreference() {
  const selected = document.querySelector("input[name='paymentPreference']:checked");
  return selected ? selected.value : "Request now";
}

function updatePaymentSelection() {
  const paymentPreference = getSelectedPaymentPreference();
  paymentCards.forEach((card) => {
    const input = card.querySelector("input");
    card.classList.toggle("selected", input.checked);
  });

  summaryPayment.textContent = paymentPreference;
}

function selectedTimeValue(selectName, customName) {
  const selected = form.elements[selectName]?.value || "";
  if (selected !== "custom") return selected;
  return String(form.elements[customName]?.value || "").trim();
}

function toggleCustomTimeField(select, field) {
  if (!select || !field) return;
  const customInput = field.querySelector("input");
  const isCustom = select.value === "custom";
  field.classList.toggle("hidden", !isCustom);
  if (customInput) {
    customInput.required = isCustom;
    if (!isCustom) customInput.value = "";
  }
}

function setTimeField(selectName, customName, value) {
  const select = form.elements[selectName];
  const customInput = form.elements[customName];
  const nextValue = String(value || "").trim();
  if (!select || !nextValue) return;
  const hasOption = [...select.options].some((option) => option.value === nextValue || option.textContent === nextValue);
  if (hasOption) {
    select.value = nextValue;
    if (customInput) customInput.value = "";
  } else {
    select.value = "custom";
    if (customInput) customInput.value = nextValue;
  }
}

function refreshCustomTimeFields() {
  toggleCustomTimeField(preferredTimeSelect, customTimeField);
  toggleCustomTimeField(secondaryTimeSelect, secondaryCustomTimeField);
}

function getRequestData() {
  if (!formStartedAtInput.value) formStartedAtInput.value = new Date().toISOString();
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  const tier = priceSummary();
  const extraVehicles = additionalVehiclesSummary();
  const preferredTime = selectedTimeValue("time", "customTime");
  const secondaryTime = selectedTimeValue("secondaryTime", "secondaryCustomTime");
  const secondaryDateTime = [data.secondaryDate, secondaryTime].filter(Boolean).join(" ");
  const timingNote = secondaryDateTime ? `Secondary requested window: ${secondaryDateTime}` : "";
  const vehicleNote = extraVehicles ? `Additional vehicles: ${extraVehicles}` : "";
  const recurringNote = data.recurring
    ? `Recurring service: ${data.recurringFrequency || "Frequency not selected"}`
    : "";
  const liabilityNote = data.liabilityAcceptance
    ? `Disclosure accepted: Yes (${new Date().toISOString()})`
    : "";
  const combinedNotes = [data.notes, timingNote, vehicleNote, recurringNote, liabilityNote].filter(Boolean).join("\n\n");
  return {
    ...data,
    addOns: formData.getAll("addOns").join(", "),
    additionalVehicles: extraVehicles,
    recurringService: data.recurring ? "Yes" : "No",
    recurringFrequency: data.recurring ? data.recurringFrequency : "",
    notes: combinedNotes,
    time: preferredTime,
    secondaryTime,
    secondaryDate: data.secondaryDate || "",
    liabilityAccepted: data.liabilityAcceptance ? "Yes" : "No",
    liabilityAcceptedAt: data.liabilityAcceptance ? new Date().toISOString() : "",
    size: vehicleTypeLabels[tier.vehicleType] || data.size,
    tier: tier.name,
    startingPrice: tier.startingPrice,
    createdAt: new Date().toISOString()
  };
}

function formatRequestMessage(request) {
  return [
    "New Legendary Auto Spa request",
    "Pull Up Dirty... Leave Legendary",
    `Tier: ${request.tier} (${request.startingPrice}+)`,
    `Vehicle type: ${request.size}`,
    `Focus: ${request.focusArea}`,
    `Goal: ${request.focusGoal}`,
    `Recommended: ${request.recommendedTier}`,
    request.addOns ? `Add-ons: ${request.addOns}` : null,
    request.additionalVehicles ? `Additional vehicles: ${request.additionalVehicles}` : null,
    request.recurringService === "Yes" ? `Recurring: ${request.recurringFrequency || "Frequency not selected"}` : null,
    `Payment preference: ${request.paymentPreference || getSelectedPaymentPreference()}`,
    `Name: ${request.name}`,
    `Phone: ${request.phone}`,
    request.email ? `Email: ${request.email}` : null,
    `Vehicle: ${[request.year, request.make, request.model].filter(Boolean).join(" ")} (${request.size})`,
    `Address: ${request.address}`,
    `Preferred: ${request.date} ${request.time}`,
    request.secondaryDate || request.secondaryTime ? `Secondary: ${[request.secondaryDate, request.secondaryTime].filter(Boolean).join(" ")}` : null,
    request.notes ? `Notes: ${request.notes}` : null
  ].filter(Boolean).join("\n");
}

function readRequests() {
  try {
    return JSON.parse(localStorage.getItem(REQUESTS_KEY)) || [];
  } catch {
    return [];
  }
}

function readMemberAccounts() {
  try {
    return JSON.parse(localStorage.getItem(MEMBER_ACCOUNTS_KEY)) || {};
  } catch {
    return {};
  }
}

function activeMemberPhone() {
  return localStorage.getItem(MEMBER_SESSION_KEY) || "";
}

function activeMember() {
  try {
    const profile = JSON.parse(localStorage.getItem(MEMBER_PROFILE_KEY)) || null;
    if (profile?.phone) return profile;
  } catch {}
  const phone = activeMemberPhone();
  return phone ? readMemberAccounts()[phone] || null : null;
}

function saveMemberAccount(phone, account) {
  const accounts = readMemberAccounts();
  accounts[phone] = account;
  localStorage.setItem(MEMBER_ACCOUNTS_KEY, JSON.stringify(accounts));
}

async function memberApi(path, options = {}) {
  const token = localStorage.getItem(MEMBER_TOKEN_KEY) || "";
  const result = await fetch(`/.netlify/functions/${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: token ? `Bearer ${token}` : "",
      ...(options.headers || {})
    }
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function saveVehicleToMember(request) {
  const phone = activeMemberPhone();
  if (!phone || !saveVehicleCheckbox?.checked) return;
  const account = activeMember();
  if (!account) return;
  const vehicle = {
    year: request.year || "",
    make: request.make || "",
    model: request.model || "",
    size: request.size || "",
    tier: request.tier || "",
    savedAt: new Date().toISOString()
  };
  const key = [vehicle.year, vehicle.make, vehicle.model, vehicle.size].join("|").toLowerCase();
  const vehicles = (account.vehicles || []).filter((item) => (
    [item.year, item.make, item.model, item.size].join("|").toLowerCase() !== key
  ));
  const updated = { ...account, vehicles: [vehicle, ...vehicles].slice(0, 12) };
  saveMemberAccount(phone, updated);
  localStorage.setItem(MEMBER_PROFILE_KEY, JSON.stringify(updated));

  if (!localStorage.getItem(MEMBER_TOKEN_KEY)) return;
  try {
    const data = await memberApi("member-profile", {
      method: "PATCH",
      body: JSON.stringify({
        name: updated.name || "",
        email: updated.email || "",
        vehicles: updated.vehicles || [],
        locations: updated.locations || []
      })
    });
    if (data.member) localStorage.setItem(MEMBER_PROFILE_KEY, JSON.stringify(data.member));
  } catch {
    setRequestStatus("Request saved. Vehicle will sync to your member account after backend deploy finishes.");
  }
}

function renderMemberHeader() {
  const phone = activeMemberPhone();
  const account = activeMember();
  if (!memberMenu) return;
  if (!phone || !account) {
    memberMenu.innerHTML = `
      <details class="member-dropdown">
        <summary class="member-link">Account</summary>
        <div class="member-dropdown-menu">
          <a href="member.html">Member sign-in</a>
          <a href="disclosures.html">Disclosures</a>
        </div>
      </details>
    `;
    return;
  }

  const label = account.name || "Member";
  memberMenu.innerHTML = `
    <details class="member-dropdown">
      <summary class="member-link">${escapeHtml(label)}</summary>
      <div class="member-dropdown-menu">
        <a href="member-portal.html">Member portal</a>
        <a href="member-settings.html">Settings</a>
        <a href="disclosures.html">Disclosures</a>
        <button type="button" id="memberHeaderLogout">Log out</button>
      </div>
    </details>
  `;
  document.querySelector("#memberHeaderLogout")?.addEventListener("click", () => {
    localStorage.removeItem(MEMBER_SESSION_KEY);
    localStorage.removeItem(MEMBER_TOKEN_KEY);
    localStorage.removeItem(MEMBER_PROFILE_KEY);
    window.location.href = "member.html";
  });
}

function saveRequest(request) {
  const requests = [request, ...readRequests()].slice(0, 8);
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
  renderRequests();
  saveVehicleToMember(request);
}

function renderRequests() {
  const requests = readRequests();
  if (historyCount) historyCount.textContent = String(requests.length);
  if (!requests.length) {
    requestList.innerHTML = '<p class="empty-state">No saved requests yet.</p>';
    return;
  }

  requestList.innerHTML = requests.map((request, index) => {
    const date = formatDisplayDate(request.createdAt);
    const vehicle = [request.make || "Vehicle", request.model || ""].filter(Boolean).join(" ");
    const receipt = receiptSummary(request);
    return `
      <details class="request-item" ${index === 0 ? "open" : ""}>
        <summary>
          <span>
            <strong>${escapeHtml(request.tier || "Detail request")} - ${escapeHtml(vehicle)}</strong>
            <p>${escapeHtml(request.name || "Customer")} · ${escapeHtml(request.phone || "No phone")} · ${escapeHtml(date)}</p>
          </span>
          <b>${escapeHtml(receipt.totalLabel)}</b>
        </summary>
        <div class="receipt-grid">
          <div><span>Receipt</span><strong>${escapeHtml(request.bookingReference ? `#${request.bookingReference}` : "Saved on this device")}</strong></div>
          <div><span>Package</span><strong>${escapeHtml(request.tier || "Detail request")}</strong><p>${escapeHtml(receipt.packageLabel)}</p></div>
          <div><span>Add-ons</span><strong>${escapeHtml(request.addOns || "None")}</strong><p>${escapeHtml(receipt.addOnsLabel)}</p></div>
          <div><span>Total</span><strong>${escapeHtml(receipt.totalLabel)}</strong><p>Package plus selected add-ons</p></div>
          <div><span>Extra vehicles</span><strong>${escapeHtml(request.additionalVehicles || "None")}</strong><p>${escapeHtml(request.additionalVehicles ? "Included in total" : "Single vehicle request")}</p></div>
          <div><span>Recurring</span><strong>${escapeHtml(request.recurringService === "Yes" ? request.recurringFrequency || "Recurring" : "No")}</strong><p>${escapeHtml(request.recurringService === "Yes" ? "Saved to schedule request" : "One-time request")}</p></div>
          <div><span>Payment</span><strong>${escapeHtml(request.paymentPreference || "Request now")}</strong><p>${escapeHtml(request.paymentStatus || "Pending review")}</p></div>
          <div><span>Schedule</span><strong>${escapeHtml(request.date || "No date")}</strong><p>${escapeHtml([request.time, request.secondaryDate || request.secondaryTime ? `Backup: ${[request.secondaryDate, request.secondaryTime].filter(Boolean).join(" ")}` : ""].filter(Boolean).join(" · ") || "No time")}</p></div>
          <div><span>Location</span><strong>${escapeHtml(request.address || "No address added")}</strong><p>${escapeHtml(request.notes || "")}</p></div>
          <div><span>Focus</span><strong>${escapeHtml(request.focusArea || "No focus selected")}</strong><p>${escapeHtml(request.focusGoal || "")}</p></div>
        </div>
      </details>
    `;
  }).join("");
}

function receiptSummary(request) {
  const savedTotal = moneyValue(request.startingPrice);
  const addOns = addOnTotal(request.addOns);
  const includesTotalBreakdown = /total/i.test(String(request.startingPrice || ""));
  const primaryMatch = String(request.startingPrice || "").match(/\$(\d+(?:\.\d{1,2})?) primary/i);
  const packageOnly = primaryMatch ? Number(primaryMatch[1]) : includesTotalBreakdown ? Math.max(savedTotal - addOns, 0) || savedTotal : savedTotal;
  const total = includesTotalBreakdown ? savedTotal : packageOnly + addOns;
  return {
    packageLabel: packageOnly ? `$${packageOnly}` : request.startingPrice || "Not set",
    addOnsLabel: addOns ? `$${addOns} add-ons` : "No add-ons selected",
    totalLabel: total ? `$${total}` : request.startingPrice || "Not set"
  };
}

function addOnTotal(addOns) {
  return String(addOns || "")
    .split(",")
    .reduce((sum, item) => sum + moneyValue(item), 0);
}

function formatDisplayDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
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

function openSubmissionHandoff(request) {
  const message = formatRequestMessage(request);
  const smsUrl = `sms:${BUSINESS_PHONE}?&body=${encodeURIComponent(message)}`;

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = smsUrl;
    return;
  }

  setRequestStatus(`Backend is not live yet. Call or text Legendary Auto Spa at ${BUSINESS_PHONE_DISPLAY} with the booking details.`);
}

function setRequestStatus(message) {
  statusText.textContent = message;
  finalStatus.textContent = message;
}

function updateFinalSubmitState() {
  finalSubmitButton.disabled = !liabilityAcceptance.checked;
}

function applyRequestPrefill(request) {
  if (!request) return;
  const fields = ["name", "phone", "email", "year", "make", "model", "address", "date", "secondaryDate", "notes"];
  fields.forEach((name) => {
    const field = form.elements[name];
    if (field && request[name] != null) field.value = request[name];
  });
  setTimeField("time", "customTime", request.time);
  setTimeField("secondaryTime", "secondaryCustomTime", request.secondaryTime);
  refreshCustomTimeFields();
  if (request.tier) selectTierByName(request.tier);
  if (request.size) {
    const sizeKey = Object.entries(vehicleTypeLabels).find(([, label]) => label === request.size)?.[0] || request.size;
    syncVehicleClass(sizeKey);
  }
  if (request.recurringService === "Yes") {
    recurringCheckbox.checked = true;
    recurringFrequencyField.classList.remove("hidden");
    form.elements.recurringFrequency.value = request.recurringFrequency || "";
  }
  goToStep(2);
  setRequestStatus("Review the request details, then continue to confirm.");
}

function applyPendingRebook() {
  const raw = sessionStorage.getItem(REBOOK_KEY);
  if (!raw) return;
  sessionStorage.removeItem(REBOOK_KEY);
  try {
    applyRequestPrefill(JSON.parse(raw));
  } catch {
    setRequestStatus("Could not load that saved request.");
  }
}

function bookingReference(result) {
  const id = result?.booking?.id;
  return id ? ` Reference: ${String(id).split("-")[0].toUpperCase()}.` : "";
}

function updateSavedRequestReference(createdAt, result) {
  const id = result?.booking?.id;
  if (!id || !createdAt) return;
  const requests = readRequests();
  const nextRequests = requests.map((request) => (
    request.createdAt === createdAt
      ? {
          ...request,
          bookingReference: String(id).split("-")[0].toUpperCase(),
          paymentStatus: result.payment?.status || request.paymentStatus || "Pending review"
        }
      : request
  ));
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(nextRequests));
  renderRequests();
}

function confirmationUrl(result) {
  const id = result?.booking?.id;
  const ref = id ? String(id).split("-")[0].toUpperCase() : "";
  return `confirmation.html${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
}

async function sendBookingToBackend(request) {
  const result = await fetch("/.netlify/functions/create-booking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request)
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    const setupDetail = Array.isArray(data.setup_required) && data.setup_required.length
      ? ` Needed: ${data.setup_required.join(", ")}.`
      : "";
    const detail = data.detail ? ` ${data.detail}` : "";
    const error = new Error(`${data.error || "Booking API is not available yet."}${setupDetail}${detail}`);
    error.status = result.status;
    error.recoverable = [400, 409, 422, 429, 503].includes(result.status);
    error.setupRequired = Boolean(data.setup_required?.length || result.status === 503);
    throw error;
  }
  return data;
}

async function loadPublicConfig() {
  const result = await fetch("/.netlify/functions/public-config");
  if (!result.ok) return {};
  return result.json();
}

function loadSquareScript(environment) {
  if (window.Square) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = String(environment || "sandbox").toLowerCase() === "production"
      ? "https://web.squarecdn.com/v1/square.js"
      : "https://sandbox.web.squarecdn.com/v1/square.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load Square payments."));
    document.head.appendChild(script);
  });
}

async function mountSquarePayment(bookingId) {
  const config = await loadPublicConfig();
  if (!config.square_application_id || !config.square_location_id) {
    throw new Error("Square application ID or location ID is not configured.");
  }

  await loadSquareScript(config.square_environment);
  squarePayments = window.Square.payments(config.square_application_id, config.square_location_id);
  pendingPaymentBookingId = bookingId;

  paymentElementContainer.innerHTML = "";
  if (applePayElementContainer) applePayElementContainer.innerHTML = "";

  squareCard = await squarePayments.card();
  await squareCard.attach("#paymentElement");

  if (applePayElementContainer) {
    try {
      const paymentRequest = squarePayments.paymentRequest({
        countryCode: "US",
        currencyCode: "USD",
        total: {
          amount: String((currentTotalAmountCents() / 100).toFixed(2)),
          label: "Legendary Auto Spa"
        }
      });
      squareApplePay = await squarePayments.applePay(paymentRequest);
      const applePayButton = document.createElement("button");
      applePayButton.className = "secondary-button full-width";
      applePayButton.type = "button";
      applePayButton.textContent = "Use Apple Pay";
      applePayButton.addEventListener("click", () => authorizeSquarePayment(squareApplePay));
      applePayElementContainer.appendChild(applePayButton);
    } catch {
      squareApplePay = null;
    }
  }

  squarePanel.classList.remove("hidden");
}

async function authorizeSquarePayment(paymentMethod = squareCard) {
  if (!paymentMethod || !pendingPaymentBookingId) {
    setRequestStatus("Payment form is not ready yet.");
    return;
  }

  authorizePaymentButton.textContent = "Authorizing...";
  authorizePaymentButton.disabled = true;

  try {
    const tokenResult = paymentMethod === squareCard
      ? await paymentMethod.tokenize(squareVerificationDetails())
      : await paymentMethod.tokenize();
    if (tokenResult.status !== "OK") {
      const message = tokenResult.errors?.map((error) => error.message).join(" ") || "Payment authorization failed.";
      throw new Error(message);
    }

    const result = await fetch("/.netlify/functions/authorize-payment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        booking_id: pendingPaymentBookingId,
        source_id: tokenResult.token
      })
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(data.error || `Payment authorization failed (${result.status})`);

    setRequestStatus("Payment authorized. Opening confirmation...");
    window.location.href = pendingConfirmationUrl;
  } catch (error) {
    setRequestStatus(error.message || "Payment authorization failed.");
    authorizePaymentButton.textContent = "Authorize payment";
    authorizePaymentButton.disabled = false;
  }
}

function currentTotalAmountCents() {
  const total = priceSummary().total;
  return Math.max(1, Math.round(total * 100));
}

function squareVerificationDetails() {
  const request = getRequestData();
  const [givenName, ...familyParts] = String(request.name || "").trim().split(/\s+/).filter(Boolean);
  return {
    amount: String((currentTotalAmountCents() / 100).toFixed(2)),
    currencyCode: "USD",
    intent: "CHARGE",
    customerInitiated: true,
    sellerKeyedIn: false,
    billingContact: {
      givenName: givenName || undefined,
      familyName: familyParts.join(" ") || undefined,
      email: request.email || undefined,
      phone: request.phone || undefined,
      addressLines: request.address ? [request.address] : undefined,
      countryCode: "US"
    }
  };
}

vehicleSizeSelect.addEventListener("change", () => syncVehicleClass(vehicleSizeSelect.value));

vehicleClassOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const input = option.querySelector("input");
    syncVehicleClass(input.value);
  });
});

addVehicleButton.addEventListener("click", addAdditionalVehicle);

additionalVehiclesList.addEventListener("input", (event) => {
  const card = event.target.closest("[data-vehicle-index]");
  const field = event.target.dataset.extraField;
  if (!card || !field) return;
  additionalVehicles[Number(card.dataset.vehicleIndex)][field] = event.target.value;
  updateTierSelection();
});

additionalVehiclesList.addEventListener("change", (event) => {
  const card = event.target.closest("[data-vehicle-index]");
  const field = event.target.dataset.extraField;
  if (!card || !field) return;
  additionalVehicles[Number(card.dataset.vehicleIndex)][field] = event.target.value;
  renderAdditionalVehicles();
});

additionalVehiclesList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-vehicle]");
  if (!removeButton) return;
  const card = removeButton.closest("[data-vehicle-index]");
  additionalVehicles.splice(Number(card.dataset.vehicleIndex), 1);
  renderAdditionalVehicles();
});

tierCards.forEach((card) => {
  card.addEventListener("click", () => {
    window.setTimeout(() => {
      updateTierSelection();
      goToStep(1);
    }, 140);
  });
});

focusCards.forEach((card) => {
  card.addEventListener("click", () => {
    window.setTimeout(updateFocusSelection, 0);
  });
});

paymentCards.forEach((card) => {
  card.addEventListener("click", () => {
    window.setTimeout(updatePaymentSelection, 0);
  });
});

document.querySelectorAll("[data-next]").forEach((button) => {
  button.addEventListener("click", () => {
    if (currentStep === 2 && !form.reportValidity()) {
      setRequestStatus("Finish the required contact, vehicle, address, date, and time fields before continuing.");
      return;
    }

    goToStep(currentStep + 1);
  });
});

document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => goToStep(currentStep - 1));
});

applyRecommendationButton.addEventListener("click", () => {
  const focus = getSelectedFocus();
  selectTierByName(focus.recommendation);
  statusText.textContent = `${focus.recommendation} selected based on your focus area.`;
  goToStep(2);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitRequest();
});

async function submitRequest() {
  if (!form.reportValidity()) {
    goToStep(2);
    return;
  }
  if (recurringCheckbox.checked && !form.elements.recurringFrequency.value) {
    goToStep(2);
    setRequestStatus("Select how often you want the recurring wash.");
    return;
  }
  if (!liabilityAcceptance.checked) {
    goToStep(3);
    setRequestStatus("Read and accept the disclosure terms before sending the request.");
    liabilityAcceptance.focus();
    return;
  }
  const request = getRequestData();
  request.paymentPreference = getSelectedPaymentPreference();
  saveRequest(request);
  setRequestStatus("Sending request to Legendary Auto Spa...");

  try {
    const result = await sendBookingToBackend(request);
    const reference = bookingReference(result);
    pendingConfirmationUrl = confirmationUrl(result);
    updateSavedRequestReference(request.createdAt, result);
    if (result.payment?.provider === "square" && result.payment?.booking_id) {
      try {
        await mountSquarePayment(result.payment.booking_id);
        setRequestStatus(`Request received.${reference} Complete the secure payment authorization below.`);
      } catch (paymentError) {
        setRequestStatus(`Request received.${reference} The secure payment form could not load: ${paymentError.message}`);
      }
      return;
    }
    if (result.payment_setup_required) {
      window.location.href = pendingConfirmationUrl;
      return;
    }
    window.location.href = pendingConfirmationUrl;
  } catch (error) {
    if (error.recoverable) {
      const prefix = error.setupRequired
        ? "Request could not be saved because the live backend still needs setup. "
        : "";
      setRequestStatus(`${prefix}${error.message}`);
      return;
    }
    setRequestStatus("Backend is not live yet. Opening message fallback with the booking details.");
    window.setTimeout(() => openSubmissionHandoff(request), 450);
  }
}

finalSubmitButton.addEventListener("click", submitRequest);
liabilityAcceptance.addEventListener("change", updateFinalSubmitState);

authorizePaymentButton.addEventListener("click", () => authorizeSquarePayment(squareCard));

saveDraftButton.addEventListener("click", () => {
  const request = getRequestData();
  request.paymentPreference = getSelectedPaymentPreference();
  saveRequest(request);
  setRequestStatus("Draft saved on this device.");
});

locateButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    statusText.textContent = "GPS is not available in this browser.";
    return;
  }

  statusText.textContent = "Getting your current location...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      addressInput.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      statusText.textContent = "GPS location added. Add any apartment, gate, or parking notes.";
    },
    () => {
      statusText.textContent = "Location permission was not granted. Enter the service address manually.";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
});

form.querySelectorAll("input[name='addOns']").forEach((input) => {
  input.addEventListener("change", updateTierSelection);
});

recurringCheckbox.addEventListener("change", () => {
  recurringFrequencyField.classList.toggle("hidden", !recurringCheckbox.checked);
  if (!recurringCheckbox.checked) form.elements.recurringFrequency.value = "";
});

preferredTimeSelect.addEventListener("change", () => {
  toggleCustomTimeField(preferredTimeSelect, customTimeField);
});

secondaryTimeSelect.addEventListener("change", () => {
  toggleCustomTimeField(secondaryTimeSelect, secondaryCustomTimeField);
});

enableCustomerNotificationsButton.addEventListener("click", async () => {
  if (!("Notification" in window)) {
    customerNotificationStatus.textContent = "Notifications are not supported in this browser.";
    return;
  }

  const permission = await Notification.requestPermission();
  customerNotificationStatus.textContent = permission === "granted"
    ? "Notifications are enabled on this device."
    : "Notifications were not enabled. You can allow them later in browser settings.";
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}

window.addEventListener("load", () => {
  formStartedAtInput.value = new Date().toISOString();
  window.setTimeout(() => {
    splashScreen.classList.add("hidden");
    document.body.classList.remove("splash-lock");
    showPaymentReturnState();
  }, 1800);
});

function showPaymentReturnState() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("payment") !== "authorized") return;
  goToStep(3);
  setRequestStatus("Payment authorization received. Legendary Auto Spa can now review and schedule your request.");
  squarePanel.classList.add("hidden");
}

updateTierSelection();
updateFocusSelection();
updatePaymentSelection();
refreshCustomTimeFields();
updateFinalSubmitState();
goToStep(0);
renderRequests();
renderMemberHeader();
applyPendingRebook();
