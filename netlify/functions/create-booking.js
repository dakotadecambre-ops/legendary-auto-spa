const {
  response,
  optionsResponse,
  parseJson,
  normalizeBooking,
  validateBooking,
  detectSpamSubmission,
  recentBookingForPhone,
  createRelatedBookingRecords,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse,
  createManualCapturePaymentIntent,
  sendNotifications,
  notificationConfigStatus,
  logBookingEvent
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });

  const input = parseJson(event);
  if (!input) return response(400, { error: "Invalid JSON body" });
  const spamMessage = detectSpamSubmission(input);
  if (spamMessage) return response(400, { error: spamMessage });

  const booking = normalizeBooking(input);
  const missing = validateBooking(booking);
  if (missing.length) {
    return response(400, { error: "Missing required fields", missing });
  }

  if (!supabaseConfigured()) {
    return response(503, {
      error: "Backend database is not configured yet.",
      setup_required: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    });
  }

  try {
    const recentBooking = await recentBookingForPhone(booking);
    if (recentBooking) {
      return response(429, {
        error: "A request from this phone number was just received. Please wait a moment before sending another request.",
        existing_booking_id: recentBooking.id
      });
    }

    const wantsPayment = /pre-authorize|apple pay|card/i.test(booking.payment_preference);
    let paymentIntent = null;
    const paymentSetupRequired = wantsPayment && !process.env.STRIPE_SECRET_KEY;

    if (wantsPayment && process.env.STRIPE_SECRET_KEY) {
      paymentIntent = await createManualCapturePaymentIntent(booking);
      booking.payment_intent_id = paymentIntent.id;
      booking.payment_status = paymentIntent.status === "requires_payment_method" ? "pending" : paymentIntent.status;
    }

    const inserted = await supabaseFetch("bookings", {
      method: "POST",
      body: JSON.stringify(booking)
    });
    const savedBooking = inserted?.[0] || booking;
    const relatedRecords = await safeCreateRelatedBookingRecords(savedBooking, booking);

    await safeLogBookingEvent({
      booking_id: savedBooking.id,
      event_type: "booking_created",
      status: "success",
      message: `${booking.customer_name} requested ${booking.service_tier}.`,
      details: {
        focus_area: booking.focus_area,
        payment_preference: booking.payment_preference,
        payment_setup_required: paymentSetupRequired,
        payment_intent_id: booking.payment_intent_id || null,
        ...relatedRecords
      }
    });

    if (paymentSetupRequired) {
      await safeLogBookingEvent({
        booking_id: savedBooking.id,
        event_type: "payment_setup_required",
        channel: "stripe",
        status: "warning",
        message: "Customer requested payment authorization, but STRIPE_SECRET_KEY is not configured."
      });
    }

    const baseUrl = siteBaseUrl(event);
    const notifications = await sendNotifications({
      ...booking,
      id: savedBooking.id,
      admin_url: baseUrl ? `${baseUrl}/admin` : ""
    });
    if (!notifications.length) {
      await safeLogBookingEvent({
        booking_id: savedBooking.id,
        event_type: "notification_skipped",
        status: "warning",
        message: "No email or SMS notification provider is configured.",
        details: notificationConfigStatus()
      });
    }

    await Promise.all(notifications.map((notification) => safeLogBookingEvent({
      booking_id: savedBooking.id,
      event_type: "notification",
      channel: notification.channel,
      status: notification.ok ? "success" : "error",
      message: notification.message,
      details: {
        ok: notification.ok,
        provider_id: notification.provider_id || null
      }
    })));

    return response(200, {
      ok: true,
      booking: savedBooking,
      related_records: relatedRecords,
      notifications,
      payment_setup_required: paymentSetupRequired,
      payment: paymentIntent ? {
        payment_intent_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret,
        status: paymentIntent.status
      } : null
    });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

async function safeLogBookingEvent(event) {
  try {
    await logBookingEvent(event);
  } catch (error) {
    console.error("Booking event log failed", error.message);
  }
}

async function safeCreateRelatedBookingRecords(savedBooking, booking) {
  try {
    const relatedRecords = await createRelatedBookingRecords(savedBooking, booking);
    await safeLogBookingEvent({
      booking_id: savedBooking.id,
      event_type: "records_linked",
      status: "success",
      message: "Customer, vehicle, location, and job records were linked.",
      details: relatedRecords
    });
    return relatedRecords;
  } catch (error) {
    await safeLogBookingEvent({
      booking_id: savedBooking.id,
      event_type: "records_link_failed",
      status: "warning",
      message: error.message
    });
    return {};
  }
}

function siteBaseUrl(event) {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, "");
  const host = event.headers["x-forwarded-host"] || event.headers.host || event.headers.Host || "";
  const protocol = event.headers["x-forwarded-proto"] || "https";
  return host ? `${protocol}://${host}` : "";
}
