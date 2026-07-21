const {
  response,
  optionsResponse,
  parseJson,
  requireActiveAdmin,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse,
  logBookingEvent
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });

  const auth = await requireActiveAdmin(event, ["admin"]);
  if (auth.errorResponse) return auth.errorResponse;
  const admin = auth.admin;
  if (!process.env.STRIPE_SECRET_KEY) return response(503, { error: "STRIPE_SECRET_KEY is not configured" });
  if (!supabaseConfigured()) return response(503, { error: "Supabase is not configured" });

  const input = parseJson(event);
  if (!input?.id || !input?.payment_intent_id) {
    return response(400, { error: "Booking id and payment_intent_id are required" });
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

    const body = new URLSearchParams();
    if (input.amount_to_capture) {
      const amountToCapture = Number(input.amount_to_capture);
      if (!Number.isInteger(amountToCapture) || amountToCapture <= 0) {
        return response(400, { error: "amount_to_capture must be a positive integer in cents" });
      }
      body.set("amount_to_capture", String(amountToCapture));
    }

    const stripeResult = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(input.payment_intent_id)}/capture`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    const stripeData = await stripeResult.json();
    if (!stripeResult.ok) {
      return response(400, { error: stripeData?.error?.message || "Could not capture payment" });
    }

    const updated = await supabaseFetch(`bookings?id=eq.${encodeURIComponent(input.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        payment_status: stripeData.status || "succeeded",
        updated_at: new Date().toISOString()
      })
    });
    const booking = updated?.[0] || null;
    await safeSyncJob(input.id, {
      payment_status: stripeData.status || "succeeded",
      payment_intent_id: input.payment_intent_id,
      updated_at: new Date().toISOString()
    });

    await safeLogBookingEvent({
      booking_id: input.id,
      event_type: "payment_captured",
      channel: "stripe",
      status: "success",
      message: "Admin captured the authorized payment.",
      details: {
        payment_intent_id: input.payment_intent_id,
        stripe_status: stripeData.status,
        amount_received: stripeData.amount_received || null,
        captured_by: admin.email || "admin"
      },
      created_by: admin.email || "admin"
    });

    return response(200, { ok: true, stripe: stripeData, booking });
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
