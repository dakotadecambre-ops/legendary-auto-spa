const {
  response,
  optionsResponse,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse,
  requireActiveAdmin
} = require("./_shared");

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "GET") return response(405, { error: "Method not allowed" });

  const { errorResponse } = await requireActiveAdmin(event, ["admin", "manager", "viewer"]);
  if (errorResponse) return errorResponse;
  if (!supabaseConfigured()) return response(503, { error: "Supabase is not configured." });

  try {
    const members = await supabaseFetch(
      "member_accounts?select=id,name,phone,email,active,created_at,updated_at,member_vehicles(id,year,make,model,size,notes,is_default,created_at,updated_at),member_locations(id,label,address,notes,is_default,created_at,updated_at)&order=updated_at.desc&limit=100",
      { method: "GET" }
    );

    const phones = (members || []).map((member) => member.phone).filter(Boolean);
    let requestsByPhone = {};
    if (phones.length) {
      const query = phones.map((phone) => `phone.eq.${encodeURIComponent(phone)}`).join(",");
      const bookings = await supabaseFetch(
        `bookings?select=id,phone,service_tier,starting_price,vehicle_year,vehicle_make,vehicle_model,preferred_date,preferred_time,status,created_at&or=(${query})&order=created_at.desc&limit=100`,
        { method: "GET" }
      );
      requestsByPhone = (bookings || []).reduce((grouped, booking) => {
        grouped[booking.phone] = grouped[booking.phone] || [];
        grouped[booking.phone].push(booking);
        return grouped;
      }, {});
    }

    return response(200, {
      ok: true,
      members: (members || []).map((member) => ({
        ...member,
        vehicles: member.member_vehicles || [],
        locations: member.member_locations || [],
        recent_requests: requestsByPhone[member.phone] || []
      }))
    });
  } catch (error) {
    return setupErrorResponse(error);
  }
};
