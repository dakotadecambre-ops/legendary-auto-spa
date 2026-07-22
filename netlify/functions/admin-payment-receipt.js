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

  const params = event.queryStringParameters || {};
  const bookingId = String(params.booking_id || "").trim();
  const eventId = String(params.event_id || "").trim();

  if (!bookingId && !eventId) {
    return response(400, { error: "booking_id or event_id is required" });
  }

  try {
    const filter = eventId
      ? `id=eq.${encodeURIComponent(eventId)}`
      : `booking_id=eq.${encodeURIComponent(bookingId)}`;
    const events = await supabaseFetch(
      `booking_events?select=id,booking_id,event_type,channel,status,message,details,created_by,created_at,bookings(id,customer_name,phone,email,service_tier,vehicle_year,vehicle_make,vehicle_model,vehicle_size,service_address,preferred_date,preferred_time,add_ons,payment_status,payment_intent_id)&event_type=eq.payment_captured&${filter}&order=created_at.desc&limit=1`,
      { method: "GET" }
    );
    const event = events?.[0] || null;
    if (!event) return response(404, { error: "Receipt was not found for that payment." });

    const booking = Array.isArray(event.bookings) ? event.bookings[0] : event.bookings || {};
    const receipt = event.details?.receipt || buildFallbackReceipt(event, booking);
    return response(200, { ok: true, event_id: event.id, booking, receipt });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

function buildFallbackReceipt(event, booking) {
  const details = event.details || {};
  const money = details.total_money || details.amount_money || {};
  const amountCents = Number(money.amount || 0);
  const currency = money.currency || "USD";
  const reference = String(event.booking_id || "").split("-")[0].toUpperCase();

  return {
    receipt_id: `LAS-${reference || event.id}`,
    booking_id: event.booking_id,
    square_payment_id: details.square_payment_id || booking.payment_intent_id || "",
    square_receipt_url: details.square_receipt_url || "",
    square_status: details.square_status || "",
    customer_name: booking.customer_name || "",
    phone: booking.phone || "",
    email: booking.email || "",
    service_tier: booking.service_tier || "",
    vehicle: [booking.vehicle_year, booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" "),
    vehicle_size: booking.vehicle_size || "",
    service_address: booking.service_address || "",
    preferred_date: booking.preferred_date || "",
    preferred_time: booking.preferred_time || "",
    add_ons: booking.add_ons || "",
    amount_cents: amountCents,
    amount_label: formatMoney(amountCents, currency),
    currency,
    captured_at: event.created_at,
    captured_by: event.created_by || ""
  };
}

function formatMoney(amountCents, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD"
  }).format((Number(amountCents) || 0) / 100);
}
