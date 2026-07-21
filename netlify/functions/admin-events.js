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
  if (!supabaseConfigured()) {
    return response(503, {
      error: "Backend database is not configured yet.",
      setup_required: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    });
  }

  try {
    const events = await supabaseFetch(
      "booking_events?select=id,booking_id,event_type,channel,status,message,details,created_by,created_at,bookings(customer_name,phone,service_tier,status)&order=created_at.desc&limit=100",
      { method: "GET" }
    );
    return response(200, { ok: true, events });
  } catch (error) {
    return setupErrorResponse(error);
  }
};
