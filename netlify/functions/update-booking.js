const {
  response,
  optionsResponse,
  parseJson,
  requireActiveAdmin,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse,
  logBookingEvent,
  sendCustomerBookingUpdateNotification,
  mergeNotificationPreference,
  smsOptIn,
  pushEnabled
} = require("./_shared");

const allowedStatuses = ["new", "contacted", "scheduled", "in_progress", "complete", "canceled"];
const allowedPaymentStatuses = ["not_started", "pending", "requires_capture", "succeeded", "canceled", "failed"];
const allowedVehicleSizes = ["cars", "suvs", "trucks"];
const serviceTierPrices = {
  "Signature Wash": { cars: 55, suvs: 65, trucks: 75 },
  "Interior Detail": { cars: 75, suvs: 95, trucks: 115 },
  "Inside & Out Detail": { cars: 95, suvs: 115, trucks: 135 },
  "Full Reset Detail": { cars: 145, suvs: 175, trucks: 205 },
  "Executive Showroom Detail": { cars: 225, suvs: 265, trucks: 305 }
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "PATCH") return response(405, { error: "Method not allowed" });

  const auth = await requireActiveAdmin(event, ["admin", "manager"]);
  if (auth.errorResponse) return auth.errorResponse;
  const admin = auth.admin;
  if (!supabaseConfigured()) {
    return response(503, {
      error: "Backend database is not configured yet.",
      setup_required: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    });
  }

  const input = parseJson(event);
  if (!input || !input.id) return response(400, { error: "Booking id is required" });

  try {
    const currentRows = await supabaseFetch(
      `bookings?select=*&id=eq.${encodeURIComponent(input.id)}&limit=1`,
      { method: "GET" }
    );
    const currentBooking = currentRows?.[0] || null;
    if (!currentBooking) return response(404, { error: "Booking was not found" });

    const update = { updated_at: new Date().toISOString() };
    if (input.status && allowedStatuses.includes(input.status)) update.status = input.status;
    if (input.payment_status && allowedPaymentStatuses.includes(input.payment_status)) update.payment_status = input.payment_status;
    if (typeof input.assigned_to === "string") update.assigned_to = input.assigned_to.slice(0, 120);
    if (typeof input.private_notes === "string") update.private_notes = input.private_notes.slice(0, 2000);
    if (typeof input.service_tier === "string" && serviceTierPrices[input.service_tier.trim()]) update.service_tier = input.service_tier.trim();
    if (typeof input.vehicle_size === "string" && allowedVehicleSizes.includes(input.vehicle_size.trim())) update.vehicle_size = input.vehicle_size.trim();
    if (typeof input.preferred_date === "string") {
      const value = input.preferred_date.trim();
      if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) update.preferred_date = value || null;
    }
    if (typeof input.preferred_time === "string") update.preferred_time = input.preferred_time.trim().slice(0, 80) || null;
    if (typeof input.notification_preference === "string") {
      update.notification_preference = mergeNotificationPreference(currentBooking.notification_preference, input.notification_preference);
      update.sms_opt_in = smsOptIn(input.sms_opt_in, update.notification_preference);
      update.push_enabled = pushEnabled(input.push_enabled, update.notification_preference);
    }

    if (update.service_tier || update.vehicle_size) {
      const price = calculateStartingPrice(update.service_tier || currentBooking.service_tier, update.vehicle_size || currentBooking.vehicle_size);
      if (price) update.starting_price = price;
    }

    const customerNotification = customerNotificationPlan(currentBooking, update);
    const updated = await supabaseFetch(`bookings?id=eq.${encodeURIComponent(input.id)}`, {
      method: "PATCH",
      body: JSON.stringify(update)
    });
    const booking = updated?.[0] || null;

    await safeSyncJob(input.id, update);
    await safeSyncVehicle(input.id, update);
    await safeLogBookingEvent({
      booking_id: input.id,
      event_type: "booking_updated",
      status: "success",
      message: "Admin updated the booking.",
      details: {
        ...update,
        customer_notification: customerNotification
      },
      created_by: admin.email || "admin"
    });

    const customerNotificationResult = customerNotification
      ? await safeSendCustomerUpdate(booking || { ...currentBooking, ...update }, customerNotification, admin)
      : null;

    return response(200, { ok: true, booking, customer_notification: customerNotificationResult });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

async function safeSyncJob(bookingId, update) {
  try {
    const jobUpdate = {
      updated_at: update.updated_at
    };
    if (update.status) jobUpdate.status = update.status;
    if (update.payment_status) jobUpdate.payment_status = update.payment_status;
    if (Object.prototype.hasOwnProperty.call(update, "service_tier")) jobUpdate.service_tier = update.service_tier;
    if (Object.prototype.hasOwnProperty.call(update, "preferred_date")) jobUpdate.preferred_date = update.preferred_date;
    if (Object.prototype.hasOwnProperty.call(update, "preferred_time")) jobUpdate.preferred_time = update.preferred_time;
    if (Object.prototype.hasOwnProperty.call(update, "starting_price")) jobUpdate.starting_price = update.starting_price;
    if (Object.prototype.hasOwnProperty.call(update, "assigned_to")) jobUpdate.assigned_to = update.assigned_to || null;
    if (Object.prototype.hasOwnProperty.call(update, "private_notes")) jobUpdate.private_notes = update.private_notes || null;

    await supabaseFetch(`jobs?booking_id=eq.${encodeURIComponent(bookingId)}`, {
      method: "PATCH",
      body: JSON.stringify(jobUpdate)
    });
  } catch (error) {
    console.error("Job sync failed", error.message);
  }
}

async function safeSyncVehicle(bookingId, update) {
  try {
    const vehicleUpdate = {
      updated_at: update.updated_at
    };
    if (Object.prototype.hasOwnProperty.call(update, "vehicle_size")) vehicleUpdate.size = update.vehicle_size;
    if (Object.keys(vehicleUpdate).length === 1) return;

    await supabaseFetch(`vehicles?booking_id=eq.${encodeURIComponent(bookingId)}`, {
      method: "PATCH",
      body: JSON.stringify(vehicleUpdate)
    });
  } catch (error) {
    console.error("Vehicle sync failed", error.message);
  }
}

async function safeSendCustomerUpdate(booking, notification, admin) {
  try {
    const result = await sendCustomerBookingUpdateNotification(booking, notification);
    const channels = result.channels?.length ? result.channels : [{ channel: "sms", provider_id: result.provider_id || null }];
    await Promise.all(channels.map((item) => safeLogBookingEvent({
      booking_id: booking.id,
      event_type: item.channel === "push" ? "customer_update_push" : "customer_update_sms",
      channel: item.channel,
      status: "success",
      message: `Customer received a ${notification.eventLabel.toLowerCase()} update via ${item.channel}.`,
      details: {
        provider_id: item.provider_id || null,
        event: notification.eventLabel
      },
      created_by: admin.email || "admin"
    })));
    return result;
  } catch (error) {
    await safeLogBookingEvent({
      booking_id: booking.id,
      event_type: "customer_update_notification",
      channel: "customer",
      status: "warning",
      message: error.message || "Customer update failed.",
      details: { event: notification.eventLabel },
      created_by: admin.email || "admin"
    });
    return {
      ok: false,
      message: error.message || "Customer update failed."
    };
  }
}

function customerNotificationPlan(currentBooking, update) {
  const changes = [];
  if (Object.prototype.hasOwnProperty.call(update, "preferred_date") && changed(currentBooking.preferred_date, update.preferred_date)) {
    changes.push(`Date: ${formatDateLabel(update.preferred_date)}`);
  }
  if (Object.prototype.hasOwnProperty.call(update, "preferred_time") && changed(currentBooking.preferred_time, update.preferred_time)) {
    changes.push(`Time: ${update.preferred_time || "Not set"}`);
  }

  const statusChanged = Object.prototype.hasOwnProperty.call(update, "status") && changed(currentBooking.status, update.status);
  const nextStatus = statusChanged ? update.status : currentBooking.status;
  const serviceTier = update.service_tier || currentBooking.service_tier;
  const scheduleLine = `${formatDateLabel(update.preferred_date || currentBooking.preferred_date)} at ${update.preferred_time || currentBooking.preferred_time || "the requested time"}`;

  if (nextStatus === "scheduled") {
    return {
      eventLabel: changes.length ? "Booking accepted and updated" : "Booking accepted",
      title: "Legendary Auto Spa booking accepted",
      body: changes.length
        ? `Your ${serviceTier} has been accepted and updated for ${scheduleLine}.`
        : `Your ${serviceTier} has been accepted for ${scheduleLine}.`,
      smsBody: [
        "Legendary Auto Spa update:",
        changes.length
          ? `Your booking is accepted and updated for ${scheduleLine}.`
          : `Your booking is accepted for ${scheduleLine}.`,
        `Package: ${serviceTier}.`,
        "Questions? Call 201-665-2625."
      ].join(" "),
      tag: "booking-accepted"
    };
  }

  if (nextStatus === "canceled") {
    return {
      eventLabel: "Booking declined",
      title: "Legendary Auto Spa booking declined",
      body: "Your request was declined. Please call or text us to reschedule or review the details.",
      smsBody: "Legendary Auto Spa update: Your request was declined. Please call or text 201-665-2625 if you want to reschedule or review the details.",
      tag: "booking-declined"
    };
  }

  if (nextStatus === "in_progress") {
    return {
      eventLabel: "Tech on the way",
      title: "Your detailer is on the way",
      body: `Your Legendary Auto Spa detailer is on the way for your ${serviceTier}.`,
      smsBody: `Legendary Auto Spa update: Your detailer is on the way for your ${serviceTier}. Questions? Call 201-665-2625.`,
      tag: "booking-on-the-way"
    };
  }

  if (nextStatus === "complete") {
    return {
      eventLabel: "Booking completed",
      title: "Your booking is complete",
      body: `Your ${serviceTier} is complete. Thank you for booking Legendary Auto Spa.`,
      smsBody: `Legendary Auto Spa update: Your ${serviceTier} is complete. Thank you for booking with us.`,
      tag: "booking-complete"
    };
  }

  if (changes.length) {
    return {
      eventLabel: "Time/date changed",
      title: "Your booking time was updated",
      body: `Your ${serviceTier} has a new schedule: ${scheduleLine}.`,
      smsBody: [
        "Legendary Auto Spa update:",
        changes.join(" "),
        `Current request: ${serviceTier} for ${vehicleSizeLabel(update.vehicle_size || currentBooking.vehicle_size)} on ${scheduleLine}.`,
        "Questions? Call 201-665-2625."
      ].join(" "),
      tag: "booking-schedule-updated"
    };
  }

  return null;
}

function changed(previousValue, nextValue) {
  return String(previousValue || "") !== String(nextValue || "");
}

function vehicleSizeLabel(value) {
  if (value === "cars") return "Car / Sedan / Coupe";
  if (value === "suvs") return "SUV / Crossover";
  if (value === "trucks") return "Truck / Large SUV";
  return value || "Vehicle";
}

function formatDateLabel(value) {
  if (!value) return "Not set";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function calculateStartingPrice(serviceTier, vehicleSize) {
  const price = serviceTierPrices[serviceTier]?.[vehicleSize];
  return price ? `$${price}` : "";
}

async function safeLogBookingEvent(event) {
  try {
    await logBookingEvent(event);
  } catch (error) {
    console.error("Booking update event log failed", error.message);
  }
}
