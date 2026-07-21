const BUSINESS_PHONE = "+12016652625";
const BUSINESS_PHONE_DISPLAY = "201-665-2625";
const REQUESTS_KEY = "legendary-auto-spa.requests";

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
const stripePanel = document.querySelector("#stripePanel");
const paymentElementContainer = document.querySelector("#paymentElement");
const authorizePaymentButton = document.querySelector("#authorizePaymentButton");
const requestList = document.querySelector("#requestList");
const historyCount = document.querySelector("#historyCount");
const installButton = document.querySelector("#installButton");
const addVehicleButton = document.querySelector("#addVehicleButton");
const additionalVehiclesList = document.querySelector("#additionalVehiclesList");
const enableCustomerNotificationsButton = document.querySelector("#enableCustomerNotificationsButton");
const customerNotificationStatus = document.querySelector("#customerNotificationStatus");

let deferredInstallPrompt = null;
let currentStep = 0;
let stripeInstance = null;
let stripeElements = null;
let additionalVehicles = [];

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

function getRequestData() {
  if (!formStartedAtInput.value) formStartedAtInput.value = new Date().toISOString();
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  const tier = priceSummary();
  const extraVehicles = additionalVehiclesSummary();
  const timingNote = data.secondaryTime ? `Secondary time: ${data.secondaryTime}` : "";
  const vehicleNote = extraVehicles ? `Additional vehicles: ${extraVehicles}` : "";
  const combinedNotes = [data.notes, timingNote, vehicleNote].filter(Boolean).join("\n\n");
  return {
    ...data,
    addOns: formData.getAll("addOns").join(", "),
    additionalVehicles: extraVehicles,
    notes: combinedNotes,
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
    `Payment preference: ${request.paymentPreference || getSelectedPaymentPreference()}`,
    `Name: ${request.name}`,
    `Phone: ${request.phone}`,
    request.email ? `Email: ${request.email}` : null,
    `Vehicle: ${[request.year, request.make, request.model].filter(Boolean).join(" ")} (${request.size})`,
    `Address: ${request.address}`,
    `Preferred: ${request.date} ${request.time}`,
    request.secondaryTime ? `Secondary time: ${request.secondaryTime}` : null,
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

function saveRequest(request) {
  const requests = [request, ...readRequests()].slice(0, 8);
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
  renderRequests();
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
          <div><span>Payment</span><strong>${escapeHtml(request.paymentPreference || "Request now")}</strong><p>${escapeHtml(request.paymentStatus || "Pending review")}</p></div>
          <div><span>Schedule</span><strong>${escapeHtml(request.date || "No date")}</strong><p>${escapeHtml([request.time, request.secondaryTime ? `Backup: ${request.secondaryTime}` : ""].filter(Boolean).join(" · ") || "No time")}</p></div>
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

function loadStripeScript() {
  if (window.Stripe) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load Stripe.js"));
    document.head.appendChild(script);
  });
}

async function mountStripePayment(clientSecret) {
  const config = await loadPublicConfig();
  if (!config.stripe_publishable_key) {
    throw new Error("Stripe publishable key is not configured.");
  }

  await loadStripeScript();
  stripeInstance = window.Stripe(config.stripe_publishable_key);
  stripeElements = stripeInstance.elements({
    clientSecret,
    appearance: {
      theme: "night",
      variables: {
        colorPrimary: "#d6b870",
        colorBackground: "#101010",
        colorText: "#f7f3ea",
        borderRadius: "8px"
      }
    }
  });

  paymentElementContainer.innerHTML = "";
  const paymentElement = stripeElements.create("payment");
  paymentElement.mount("#paymentElement");
  stripePanel.classList.remove("hidden");
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
  const request = getRequestData();
  request.paymentPreference = getSelectedPaymentPreference();
  saveRequest(request);
  setRequestStatus("Sending request to Legendary Auto Spa...");

  try {
    const result = await sendBookingToBackend(request);
    const reference = bookingReference(result);
    updateSavedRequestReference(request.createdAt, result);
    if (result.payment?.client_secret) {
      try {
        await mountStripePayment(result.payment.client_secret);
        setRequestStatus(`Request received.${reference} Complete the secure payment authorization below.`);
      } catch (paymentError) {
        setRequestStatus(`Request received.${reference} The secure payment form could not load: ${paymentError.message}`);
      }
      return;
    }
    if (result.payment_setup_required) {
      setRequestStatus(`Request received.${reference} Payment authorization is not configured yet, so Legendary Auto Spa will handle payment after review.`);
      return;
    }
    setRequestStatus(`Request received.${reference} Legendary Auto Spa can now review it in the admin dashboard.`);
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

authorizePaymentButton.addEventListener("click", async () => {
  if (!stripeInstance || !stripeElements) {
    setRequestStatus("Payment form is not ready yet.");
    return;
  }

  authorizePaymentButton.textContent = "Authorizing...";
  const result = await stripeInstance.confirmPayment({
    elements: stripeElements,
    confirmParams: {
      return_url: `${window.location.origin}${window.location.pathname}?payment=authorized`
    }
  });

  if (result.error) {
    setRequestStatus(result.error.message || "Payment authorization failed.");
    authorizePaymentButton.textContent = "Authorize payment";
    return;
  }

  setRequestStatus("Payment authorized. Legendary Auto Spa can now review and schedule your request.");
  authorizePaymentButton.textContent = "Authorized";
});

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
  stripePanel.classList.add("hidden");
}

updateTierSelection();
updateFocusSelection();
updatePaymentSelection();
goToStep(0);
renderRequests();
