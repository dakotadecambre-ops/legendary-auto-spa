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
  squareConfigured,
  createSquareAuthorization,
  mapSquarePaymentStatus,
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
    const paymentReady = squareConfigured() && process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_LOCATION_ID;
    const paymentSetupRequired = wantsPayment && !paymentReady;
    const paymentSourceId = clean(input.paymentSourceId || input.payment_source_id || input.source_id);
    if (wantsPayment && paymentReady) {
      if (!paymentSourceId) {
        return response(400, { error: "Payment details are required before sending this request." });
      }
      booking.payment_status = "pending";
    }

    const inserted = await supabaseFetch("bookings", {
      method: "POST",
      body: JSON.stringify(booking)
    });
    let savedBooking = inserted?.[0] || booking;
    const relatedRecords = await safeCreateRelatedBookingRecords(savedBooking, booking);
    let authorizedPayment = null;

    if (wantsPayment && paymentReady && paymentSourceId) {
      authorizedPayment = await createSquareAuthorization({ ...savedBooking, booking_id: savedBooking.id }, paymentSourceId);
      const paymentStatus = mapSquarePaymentStatus(authorizedPayment.status);
      const updated = await supabaseFetch(`bookings?id=eq.${encodeURIComponent(savedBooking.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          payment_intent_id: authorizedPayment.id,
          payment_status: paymentStatus,
          updated_at: new Date().toISOString()
        })
      });
      savedBooking = updated?.[0] || { ...savedBooking, payment_intent_id: authorizedPayment.id, payment_status: paymentStatus };
      await safeSyncJob(savedBooking.id, {
        payment_status: paymentStatus,
        payment_intent_id: authorizedPayment.id,
        updated_at: new Date().toISOString()
      });
      await safeLogBookingEvent({
        booking_id: savedBooking.id,
        event_type: "payment_authorized",
        channel: "square",
        status: "success",
        message: `${input.paymentSourceType || "Payment"} was authorized with Square.`,
        details: {
          square_payment_id: authorizedPayment.id,
          square_status: authorizedPayment.status,
          amount_money: authorizedPayment.amount_money || null
        }
      });
    }

    await safeLogBookingEvent({
      booking_id: savedBooking.id,
      event_type: "booking_created",
      status: "success",
      message: `${booking.customer_name} requested ${booking.service_tier}.`,
      details: {
        focus_area: booking.focus_area,
        payment_preference: booking.payment_preference,
        payment_setup_required: paymentSetupRequired,
        payment_provider: wantsPayment ? "square" : null,
        payment_intent_id: booking.payment_intent_id || null,
        ...relatedRecords
      }
    });

    if (paymentSetupRequired) {
      await safeLogBookingEvent({
        booking_id: savedBooking.id,
        event_type: "payment_setup_required",
        channel: "square",
        status: "warning",
        message: "Customer requested payment authorization, but Square payment settings are not configured."
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
      payment: wantsPayment && paymentReady ? {
        provider: "square",
        booking_id: savedBooking.id,
        payment_id: authorizedPayment?.id || savedBooking.payment_intent_id || null,
        status: savedBooking.payment_status || "pending",
        square_status: authorizedPayment?.status || null
      } : null
    });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

function clean(value) {
  return String(value || "").trim();
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
