const REBOOK_KEY = "legendary-auto-spa.rebookRequest";
const REQUESTS_KEY = "legendary-auto-spa.requests";

const rebookSummary = document.querySelector("#rebookSummary");
const rebookStatus = document.querySelector("#rebookStatus");
const confirmRebookButton = document.querySelector("#confirmRebookButton");
const editRequestButton = document.querySelector("#editRequestButton");

function pendingRequest() {
  try {
    return JSON.parse(sessionStorage.getItem(REBOOK_KEY)) || null;
  } catch {
    return null;
  }
}

function renderRequest() {
  const request = pendingRequest();
  if (!request) {
    rebookSummary.innerHTML = '<p class="empty-state">No request selected. Return to the member portal and choose a recent request.</p>';
    confirmRebookButton.disabled = true;
    return;
  }

  rebookSummary.innerHTML = `
    <div><span>Customer</span><strong>${escapeHtml(request.name || "Member")}</strong><p>${escapeHtml(request.phone || "")}</p></div>
    <div><span>Vehicle</span><strong>${escapeHtml([request.year, request.make, request.model].filter(Boolean).join(" ") || "Vehicle")}</strong><p>${escapeHtml(request.size || "")}</p></div>
    <div><span>Package</span><strong>${escapeHtml(request.tier || "Detail request")}</strong><p>${escapeHtml(request.startingPrice || "No total")}</p></div>
    <div><span>Add-ons</span><strong>${escapeHtml(request.addOns || "None")}</strong><p>${escapeHtml(request.additionalVehicles || "No extra vehicles")}</p></div>
    <div><span>Schedule</span><strong>${escapeHtml(request.date || "Same date requested")}</strong><p>${escapeHtml([request.time, request.secondaryDate || request.secondaryTime ? `Backup: ${[request.secondaryDate, request.secondaryTime].filter(Boolean).join(" ")}` : ""].filter(Boolean).join(" · ") || "No time")}</p></div>
    <div><span>Location</span><strong>${escapeHtml(request.address || "No address")}</strong><p>${escapeHtml(request.notes || "")}</p></div>
    <div><span>Recurring</span><strong>${escapeHtml(request.recurringService === "Yes" ? request.recurringFrequency || "Recurring" : "No")}</strong><p>${escapeHtml(request.recurringService === "Yes" ? "Recurring schedule request" : "One-time request")}</p></div>
    <div><span>Payment</span><strong>${escapeHtml(request.paymentPreference || "Request now")}</strong><p>Payment will follow the selected request option.</p></div>
  `;
}

function saveLocalReceipt(request, result) {
  const id = result?.booking?.id;
  const receipt = {
    ...request,
    createdAt: new Date().toISOString(),
    bookingReference: id ? String(id).split("-")[0].toUpperCase() : request.bookingReference || "",
    paymentStatus: result?.payment?.status || "Pending review"
  };
  const requests = readRequests();
  localStorage.setItem(REQUESTS_KEY, JSON.stringify([receipt, ...requests].slice(0, 8)));
}

function readRequests() {
  try {
    return JSON.parse(localStorage.getItem(REQUESTS_KEY)) || [];
  } catch {
    return [];
  }
}

async function confirmRebook() {
  const request = pendingRequest();
  if (!request) return;

  confirmRebookButton.disabled = true;
  rebookStatus.textContent = "Submitting request...";
  const nextRequest = {
    ...request,
    createdAt: new Date().toISOString()
  };

  try {
    const result = await fetch("/.netlify/functions/create-booking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nextRequest)
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(data.error || `Request failed (${result.status})`);
    saveLocalReceipt(nextRequest, data);
    sessionStorage.removeItem(REBOOK_KEY);
    const ref = data?.booking?.id ? String(data.booking.id).split("-")[0].toUpperCase() : "";
    window.location.href = `confirmation.html${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
  } catch (error) {
    rebookStatus.textContent = error.message;
    confirmRebookButton.disabled = false;
  }
}

function editRequest() {
  window.location.href = "index.html?rebook=1#booking";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

confirmRebookButton.addEventListener("click", confirmRebook);
editRequestButton.addEventListener("click", editRequest);
renderRequest();
