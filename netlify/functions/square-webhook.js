const crypto = require("crypto");
const {
  response,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse,
  mapSquarePaymentStatus,
  logBookingEvent
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });
  if (!process.env.SQUARE_WEBHOOK_SIGNATURE_KEY) {
    return response(503, { error: "SQUARE_WEBHOOK_SIGNATURE_KEY is not configured" });
  }
  if (!supabaseConfigured()) return response(503, { error: "Supabase is not configured" });

  const rawBody = rawSquareBody(event);
  const signatureHeader = event.headers["x-square-hmacsha256-signature"] || event.headers["X-Square-HmacSha256-Signature"];
  const notificationUrl = process.env.SQUARE_WEBHOOK_URL || `${siteBaseUrl(event)}/.netlify/functions/square-webhook`;
  if (!verifySquareSignature(rawBody, signatureHeader, process.env.SQUARE_WEBHOOK_SIGNATURE_KEY, notificationUrl)) {
    return response(400, { error: "Invalid Square signature" });
  }

  let squareEvent = null;
  try {
    squareEvent = JSON.parse(rawBody);
  } catch {
    return response(400, { error: "Invalid Square webhook JSON" });
  }

  const payment = squareEvent.data?.object?.payment;
  if (!payment?.id) return response(200, { ok: true, ignored: true });

  const paymentStatus = mapSquarePaymentStatus(payment.status);
  if (!paymentStatus) return response(200, { ok: true, ignored: true });

  try {
    const updated = await supabaseFetch(`bookings?payment_intent_id=eq.${encodeURIComponent(payment.id)}`, {
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
        payment_intent_id: payment.id,
        updated_at: new Date().toISOString()
      });

      await safeLogBookingEvent({
        booking_id: booking.id,
        event_type: "payment_webhook",
        channel: "square",
        status: paymentStatus === "failed" ? "error" : "success",
        message: `Square updated payment status to ${paymentStatus}.`,
        details: {
          square_event_type: squareEvent.type,
          square_payment_id: payment.id,
          square_status: payment.status
        }
      });
    }

    return response(200, { ok: true });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

function rawSquareBody(event) {
  const body = event.body || "";
  if (!event.isBase64Encoded) return body;
  return Buffer.from(body, "base64").toString("utf8");
}

function verifySquareSignature(rawBody, header, signatureKey, notificationUrl) {
  if (!header || !signatureKey || !notificationUrl) return false;
  const expected = crypto
    .createHmac("sha256", signatureKey)
    .update(`${notificationUrl}${rawBody}`)
    .digest("base64");

  if (expected.length !== header.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}

function siteBaseUrl(event) {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, "");
  const host = event.headers["x-forwarded-host"] || event.headers.host || event.headers.Host || "";
  const protocol = event.headers["x-forwarded-proto"] || "https";
  return host ? `${protocol}://${host}` : "";
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
