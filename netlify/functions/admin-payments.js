const {
  response,
  optionsResponse,
  requireActiveAdmin,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "GET") return response(405, { error: "Method not allowed" });

  const auth = await requireActiveAdmin(event);
  if (auth.errorResponse) return auth.errorResponse;
  if (!supabaseConfigured()) return response(503, { error: "Supabase is not configured" });

  try {
    const events = await supabaseFetch(
      "booking_events?select=id,booking_id,event_type,channel,status,message,details,created_by,created_at,bookings(id,customer_name,phone,email,service_tier,vehicle_year,vehicle_make,vehicle_model,service_address,payment_status,payment_intent_id,status)&event_type=eq.payment_captured&order=created_at.asc&limit=500",
      { method: "GET" }
    );
    const payments = (events || []).map(normalizePayment);
    const totalCents = payments.reduce((sum, payment) => sum + payment.amount_cents, 0);

    return response(200, {
      ok: true,
      total_cents: totalCents,
      total_label: formatMoney(totalCents, "USD"),
      payments
    });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

function normalizePayment(event) {
  const details = event.details || {};
  const receipt = details.receipt || {};
  const booking = Array.isArray(event.bookings) ? event.bookings[0] : event.bookings || {};
  const amountCents = Number(receipt.amount_cents || details.total_money?.amount || details.amount_money?.amount || 0);
  const currency = receipt.currency || details.total_money?.currency || details.amount_money?.currency || "USD";

  return {
    id: event.id,
    booking_id: event.booking_id,
    customer_name: receipt.customer_name || booking.customer_name || "",
    phone: receipt.phone || booking.phone || "",
    email: receipt.email || booking.email || "",
    service_tier: receipt.service_tier || booking.service_tier || "",
    vehicle: receipt.vehicle || [booking.vehicle_year, booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" "),
    amount_cents: amountCents,
    amount_label: formatMoney(amountCents, currency),
    currency,
    captured_at: receipt.captured_at || event.created_at,
    captured_by: receipt.captured_by || event.created_by || "",
    square_payment_id: receipt.square_payment_id || details.square_payment_id || booking.payment_intent_id || "",
    receipt_id: receipt.receipt_id || "",
    receipt
  };
}

function formatMoney(amountCents, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD"
  }).format((Number(amountCents) || 0) / 100);
}
