const {
  response,
  optionsResponse,
  parseJson,
  requireActiveAdmin,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse,
  squareConfigured,
  completeSquarePayment,
  mapSquarePaymentStatus,
  logBookingEvent
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });

  const auth = await requireActiveAdmin(event, ["admin"]);
  if (auth.errorResponse) return auth.errorResponse;
  const admin = auth.admin;
  if (!squareConfigured()) return response(503, { error: "Square payment settings are not configured" });
  if (!supabaseConfigured()) return response(503, { error: "Supabase is not configured" });

  const input = parseJson(event);
  if (!input?.id || !input?.payment_intent_id) {
    return response(400, { error: "Booking id and Square payment id are required" });
  }

  try {
    const bookingRows = await supabaseFetch(
      `bookings?select=id,payment_intent_id,payment_status&id=eq.${encodeURIComponent(input.id)}&payment_intent_id=eq.${encodeURIComponent(input.payment_intent_id)}&limit=1`,
      { method: "GET" }
    );
    const bookingMatch = bookingRows?.[0] || null;
    if (!bookingMatch) {
      return response(404, { error: "No matching booking/payment authorization was found" });
    }
    if (bookingMatch.payment_status === "succeeded") {
      return response(409, { error: "Payment has already been captured" });
    }

    const squarePayment = await completeSquarePayment(input.payment_intent_id);
    const paymentStatus = mapSquarePaymentStatus(squarePayment.status);

    const updated = await supabaseFetch(`bookings?id=eq.${encodeURIComponent(input.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        payment_status: paymentStatus,
        updated_at: new Date().toISOString()
      })
    });
    const booking = updated?.[0] || null;
    await safeSyncJob(input.id, {
      payment_status: paymentStatus,
      payment_intent_id: input.payment_intent_id,
      updated_at: new Date().toISOString()
    });

    await safeLogBookingEvent({
      booking_id: input.id,
      event_type: "payment_captured",
      channel: "square",
      status: "success",
      message: "Admin captured the authorized payment.",
      details: {
        square_payment_id: input.payment_intent_id,
        square_status: squarePayment.status,
        amount_money: squarePayment.amount_money || null,
        total_money: squarePayment.total_money || null,
        captured_by: admin.email || "admin"
      },
      created_by: admin.email || "admin"
    });

    return response(200, { ok: true, square: squarePayment, booking });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

async function safeLogBookingEvent(event) {
  try {
    await logBookingEvent(event);
  } catch (error) {
    console.error("Capture event log failed", error.message);
  }
}

async function safeSyncJob(bookingId, update) {
  try {
    await supabaseFetch(`jobs?booking_id=eq.${encodeURIComponent(bookingId)}`, {
      method: "PATCH",
      body: JSON.stringify(update)
    });
  } catch (error) {
    console.error("Capture job sync failed", error.message);
  }
}
