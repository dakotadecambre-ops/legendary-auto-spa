const ADMIN_TOKEN_KEY = "legendary.admin.token";
const paymentsTotal = document.querySelector("#paymentsTotal");
const toggleIncomeButton = document.querySelector("#toggleIncomeButton");
const refreshPaymentsButton = document.querySelector("#refreshPaymentsButton");
const paymentsList = document.querySelector("#paymentsList");

let totalLabel = "$0.00";
let incomeHidden = false;

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

async function loadPayments() {
  if (!token()) {
    window.location.href = "admin.html";
    return;
  }

  paymentsList.innerHTML = '<p class="empty-state">Loading payments...</p>';
  try {
    const data = await api("admin-payments");
    totalLabel = data.total_label || "$0.00";
    renderTotal();
    renderPayments(data.payments || []);
  } catch (error) {
    paymentsList.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

function renderTotal() {
  paymentsTotal.textContent = incomeHidden ? "******" : totalLabel;
  toggleIncomeButton.textContent = incomeHidden ? "Show" : "Hide";
}

function renderPayments(payments) {
  if (!payments.length) {
    paymentsList.innerHTML = '<p class="empty-state">No captured payments yet.</p>';
    return;
  }

  paymentsList.innerHTML = payments.map((payment) => `
    <article class="activity-item payment-row">
      <div>
        <strong>${escapeHtml(payment.customer_name || "Customer")} · ${escapeHtml(payment.amount_label || "$0.00")}</strong>
        <p>${escapeHtml(payment.service_tier || "Detail request")} · ${escapeHtml(payment.vehicle || "Vehicle")}</p>
        <small>${escapeHtml(payment.square_payment_id || "")}</small>
      </div>
      <span>
        ${formatDate(payment.captured_at)}
        <small>${escapeHtml(payment.captured_by || "")}</small>
        <a class="inline-admin-link" href="capture-success.html?booking_id=${encodeURIComponent(payment.booking_id || "")}&event_id=${encodeURIComponent(payment.id || "")}">Receipt</a>
      </span>
    </article>
  `).join("");
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

toggleIncomeButton.addEventListener("click", () => {
  incomeHidden = !incomeHidden;
  renderTotal();
});

refreshPaymentsButton.addEventListener("click", loadPayments);

loadPayments();
