const ADMIN_TOKEN_KEY = "legendary.admin.token";
const LAST_RECEIPT_KEY = "legendary.admin.lastReceipt";
const receiptDocument = document.querySelector("#receiptDocument");
const printReceiptButton = document.querySelector("#printReceiptButton");
const downloadPdfButton = document.querySelector("#downloadPdfButton");
let currentReceipt = null;

function token() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
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
  if (!result.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function loadReceipt() {
  if (!token()) {
    window.location.href = "admin.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get("booking_id") || "";
  const eventId = params.get("event_id") || "";

  try {
    const query = eventId
      ? `event_id=${encodeURIComponent(eventId)}`
      : `booking_id=${encodeURIComponent(bookingId)}`;
    const data = await api(`admin-payment-receipt?${query}`);
    renderReceipt(data.receipt || {});
  } catch (error) {
    const fallback = readFallbackReceipt();
    if (fallback) {
      renderReceipt(fallback);
      return;
    }
    receiptDocument.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

function readFallbackReceipt() {
  try {
    return JSON.parse(sessionStorage.getItem(LAST_RECEIPT_KEY)) || null;
  } catch {
    return null;
  }
}

function renderReceipt(receipt) {
  currentReceipt = receipt;
  downloadPdfButton.disabled = !receipt.pdf_base64;
  receiptDocument.innerHTML = `
    <div class="receipt-brand">
      <img src="assets/legendary-brand.svg" alt="Legendary Auto Spa">
      <div>
        <p>Pull Up Dirty... Leave Legendary</p>
        <h2>Payment Receipt</h2>
      </div>
    </div>
    <div class="receipt-grid">
      ${receiptLine("Receipt", receipt.receipt_id)}
      ${receiptLine("Captured", formatDate(receipt.captured_at))}
      ${receiptLine("Amount", receipt.amount_label)}
      ${receiptLine("Captured by", receipt.captured_by)}
      ${receiptLine("Customer", receipt.customer_name)}
      ${receiptLine("Phone", receipt.phone)}
      ${receiptLine("Email", receipt.email)}
      ${receiptLine("Package", receipt.service_tier)}
      ${receiptLine("Vehicle", [receipt.vehicle, receipt.vehicle_size].filter(Boolean).join(" · "))}
      ${receiptLine("Add-ons", receipt.add_ons || "None")}
      ${receiptLine("Address", receipt.service_address)}
      ${receiptLine("Schedule", [receipt.preferred_date, receipt.preferred_time].filter(Boolean).join(" "))}
      ${receiptLine("Square Payment", receipt.square_payment_id)}
      ${receiptLinkLine("Square Receipt", receipt.square_receipt_url)}
      ${receiptLine("Square Status", receipt.square_status)}
    </div>
  `;
}

function receiptLine(label, value) {
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "Not recorded")}</strong>
    </div>
  `;
}

function receiptLinkLine(label, value) {
  if (!value) return receiptLine(label, "");
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong><a class="inline-admin-link" href="${escapeAttribute(value)}" target="_blank" rel="noreferrer">Open Square receipt</a></strong>
    </div>
  `;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
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

printReceiptButton.addEventListener("click", () => window.print());

downloadPdfButton.addEventListener("click", () => {
  if (!currentReceipt?.pdf_base64) return;
  const bytes = Uint8Array.from(atob(currentReceipt.pdf_base64), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = currentReceipt.pdf_filename || "legendary-auto-spa-receipt.pdf";
  link.click();
  URL.revokeObjectURL(url);
});

loadReceipt();
