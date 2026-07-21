const crypto = require("crypto");
const {
  response,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse,
  logBookingEvent
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return response(503, { error: "STRIPE_WEBHOOK_SECRET is not configured" });
  }
  if (!supabaseConfigured()) {
    return response(503, { error: "Supabase is not configured" });
  }

  const rawBody = rawStripeBody(event);
  const signatureHeader = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  if (!verifyStripeSignature(rawBody, signatureHeader, process.env.STRIPE_WEBHOOK_SECRET)) {
    return response(400, { error: "Invalid Stripe signature" });
  }

  let stripeEvent = null;
  try {
    stripeEvent = JSON.parse(rawBody);
  } catch {
    return response(400, { error: "Invalid Stripe webhook JSON" });
  }
  const intent = stripeEvent.data?.object;
  if (!intent?.id || intent.object !== "payment_intent") {
    return response(200, { ok: true, ignored: true });
  }

  const paymentStatus = mapStripeEventToPaymentStatus(stripeEvent.type, intent.status);
  if (!paymentStatus) return response(200, { ok: true, ignored: true });

  try {
    const updated = await supabaseFetch(`bookings?payment_intent_id=eq.${encodeURIComponent(intent.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        payment_status: paymentStatus,
        updated_at: new Date().toISOString()
      })
    });

    const booking = updated?.[0] || null;
    if (booking?.id) {
      await safeSyncJob(booking.id, {
        payment_status: paymentStatus,
        payment_intent_id: intent.id,
        updated_at: new Date().toISOString()
      });

      await safeLogBookingEvent({
        booking_id: booking.id,
        event_type: "payment_webhook",
        channel: "stripe",
        status: paymentStatus === "failed" ? "error" : "success",
        message: `Stripe updated payment status to ${paymentStatus}.`,
        details: {
          stripe_event_type: stripeEvent.type,
          payment_intent_id: intent.id,
          stripe_status: intent.status
        }
      });
    }

    return response(200, { ok: true });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

function rawStripeBody(event) {
  const body = event.body || "";
  if (!event.isBase64Encoded) return body;
  return Buffer.from(body, "base64").toString("utf8");
}

async function safeLogBookingEvent(event) {
  try {
    await logBookingEvent(event);
  } catch (error) {
    console.error("Payment event log failed", error.message);
  }
}

async function safeSyncJob(bookingId, update) {
  try {
    await supabaseFetch(`jobs?booking_id=eq.${encodeURIComponent(bookingId)}`, {
      method: "PATCH",
      body: JSON.stringify(update)
    });
  } catch (error) {
    console.error("Webhook job sync failed", error.message);
  }
}

function verifyStripeSignature(rawBody, header, secret) {
  if (!header) return false;

  const values = header.split(",").reduce((acc, part) => {
    const [key, ...rest] = part.split("=");
    const value = rest.join("=");
    if (!key || !value) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(value);
    return acc;
  }, {});

  const timestamp = Number(values.t?.[0]);
  const signatures = values.v1 || [];
  if (!timestamp || !signatures.length) return false;

  const toleranceSeconds = Number(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS || 300);
  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) {
    return false;
  }

  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return signatures.some((signature) => {
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  });
}

function mapStripeEventToPaymentStatus(type, intentStatus) {
  if (type === "payment_intent.amount_capturable_updated") return "requires_capture";
  if (type === "payment_intent.succeeded") return "succeeded";
  if (type === "payment_intent.canceled") return "canceled";
  if (type === "payment_intent.payment_failed") return "failed";
  if (intentStatus === "requires_capture") return "requires_capture";
  return null;
}
