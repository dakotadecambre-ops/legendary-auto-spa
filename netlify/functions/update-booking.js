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

const allowedStatuses = ["new", "contacted", "scheduled", "in_progress", "complete", "canceled"];
const allowedPaymentStatuses = ["not_started", "pending", "requires_capture", "succeeded", "canceled", "failed"];

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

  const update = { updated_at: new Date().toISOString() };
  if (input.status && allowedStatuses.includes(input.status)) update.status = input.status;
  if (input.payment_status && allowedPaymentStatuses.includes(input.payment_status)) update.payment_status = input.payment_status;
  if (typeof input.assigned_to === "string") update.assigned_to = input.assigned_to.slice(0, 120);
  if (typeof input.private_notes === "string") update.private_notes = input.private_notes.slice(0, 2000);

  try {
    const updated = await supabaseFetch(`bookings?id=eq.${encodeURIComponent(input.id)}`, {
      method: "PATCH",
      body: JSON.stringify(update)
    });
    const booking = updated?.[0] || null;

    await safeSyncJob(input.id, update);
    await safeLogBookingEvent({
      booking_id: input.id,
      event_type: "booking_updated",
      status: "success",
      message: "Admin updated the booking.",
      details: update,
      created_by: admin.email || "admin"
    });

    return response(200, { ok: true, booking });
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

async function safeLogBookingEvent(event) {
  try {
    await logBookingEvent(event);
  } catch (error) {
    console.error("Booking update event log failed", error.message);
  }
}
