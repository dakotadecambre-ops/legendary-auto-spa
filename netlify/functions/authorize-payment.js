const {
  response,
  optionsResponse,
  parseJson,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse,
  squareConfigured,
  createSquareAuthorization,
  mapSquarePaymentStatus,
  logBookingEvent
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });
  if (!supabaseConfigured()) return response(503, { error: "Supabase is not configured" });
  if (!squareConfigured()) return response(503, { error: "Square payment settings are not configured" });

  const input = parseJson(event);
  if (!input?.booking_id || !input?.source_id) {
    return response(400, { error: "booking_id and source_id are required" });
  }

  try {
    const bookingRows = await supabaseFetch(
      `bookings?select=*&id=eq.${encodeURIComponent(input.booking_id)}&limit=1`,
      { method: "GET" }
    );
    const booking = bookingRows?.[0] || null;
    if (!booking) return response(404, { error: "Booking was not found" });
    if (!/pre-authorize|apple pay|card/i.test(booking.payment_preference || "")) {
      return response(409, { error: "This booking was not submitted with a payment authorization option" });
    }
    if (booking.payment_intent_id && ["requires_capture", "succeeded"].includes(booking.payment_status)) {
      return response(409, { error: "Payment has already been authorized for this booking" });
    }

    const payment = await createSquareAuthorization({ ...booking, booking_id: booking.id }, input.source_id);
    const paymentStatus = mapSquarePaymentStatus(payment.status);

    const updated = await supabaseFetch(`bookings?id=eq.${encodeURIComponent(booking.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        payment_intent_id: payment.id,
        payment_status: paymentStatus,
        updated_at: new Date().toISOString()
      })
    });

    await safeSyncJob(booking.id, {
      payment_status: paymentStatus,
      payment_intent_id: payment.id,
      updated_at: new Date().toISOString()
    });

    await safeLogBookingEvent({
      booking_id: booking.id,
      event_type: "payment_authorized",
      channel: "square",
      status: "success",
      message: "Customer authorized a Square payment.",
      details: {
        square_payment_id: payment.id,
        square_status: payment.status,
        amount_money: payment.amount_money || null
      }
    });

    return response(200, {
      ok: true,
      booking: updated?.[0] || booking,
      payment: {
        provider: "square",
        payment_id: payment.id,
        status: paymentStatus,
        square_status: payment.status
      }
    });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

async function safeLogBookingEvent(event) {
  try {
    await logBookingEvent(event);
  } catch (error) {
    console.error("Payment authorization event log failed", error.message);
  }
}

async function safeSyncJob(bookingId, update) {
  try {
    await supabaseFetch(`jobs?booking_id=eq.${encodeURIComponent(bookingId)}`, {
      method: "PATCH",
      body: JSON.stringify(update)
    });
  } catch (error) {
    console.error("Payment authorization job sync failed", error.message);
  }
}
