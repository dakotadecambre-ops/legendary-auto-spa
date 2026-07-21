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
    const bookings = await supabaseFetch(
      "bookings?select=*,customers(id,name,phone,email),vehicles(id,year,make,model,size),service_locations(id,address,notes),jobs(id,status,assigned_to,payment_status,payment_intent_id,private_notes,updated_at)&order=created_at.desc&limit=100",
      {
        method: "GET"
      }
    );
    return response(200, {
      ok: true,
      bookings: (bookings || []).map(normalizeBookingRelations)
    });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

function normalizeBookingRelations(booking) {
  return {
    ...booking,
    customer_record: firstRelated(booking.customers),
    vehicle_record: firstRelated(booking.vehicles),
    location_record: firstRelated(booking.service_locations),
    job_record: firstRelated(booking.jobs)
  };
}

function firstRelated(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}
