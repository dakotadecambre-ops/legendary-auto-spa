const {
  response,
  optionsResponse,
  parseJson,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse,
  requireActiveAdmin
} = require("./_shared");

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (!["GET", "DELETE"].includes(event.httpMethod)) return response(405, { error: "Method not allowed" });
  if (!supabaseConfigured()) return response(503, { error: "Supabase is not configured." });

  try {
    if (event.httpMethod === "DELETE") {
      const auth = await requireActiveAdmin(event, ["admin"]);
      if (auth.errorResponse) return auth.errorResponse;
      const input = parseJson(event);
      if (!input) return response(400, { error: "Invalid JSON body" });
      if (!input?.id) return response(400, { error: "Member id is required." });
      return deleteMemberAccount(input.id);
    }

    const { errorResponse } = await requireActiveAdmin(event, ["admin", "manager", "viewer"]);
    if (errorResponse) return errorResponse;

    const members = await supabaseFetch(
      "member_accounts?select=id,name,phone,email,notification_preference,sms_opt_in,push_enabled,active,created_at,updated_at,member_vehicles(id,year,make,model,size,notes,is_default,created_at,updated_at),member_locations(id,label,address,notes,is_default,created_at,updated_at)&order=updated_at.desc&limit=100",
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

async function deleteMemberAccount(memberId) {
  const members = await supabaseFetch(
    `member_accounts?select=id,name,phone&id=eq.${encodeURIComponent(memberId)}&limit=1`,
    { method: "GET" }
  );
  const member = members?.[0] || null;
  if (!member) return response(404, { error: "Member account was not found." });

  const relatedBookings = member.phone
    ? await supabaseFetch(
      `bookings?select=id&phone=eq.${encodeURIComponent(member.phone)}&limit=1000`,
      { method: "GET" }
    )
    : [];

  if (member.phone) {
    await supabaseFetch(
      `customer_push_subscriptions?or=(member_id.eq.${encodeURIComponent(member.id)},phone.eq.${encodeURIComponent(member.phone)})`,
      {
        method: "DELETE",
        headers: { prefer: "return=minimal" }
      }
    );

    await supabaseFetch(`bookings?phone=eq.${encodeURIComponent(member.phone)}`, {
      method: "DELETE",
      headers: { prefer: "return=minimal" }
    });
  }

  await supabaseFetch(`member_accounts?id=eq.${encodeURIComponent(member.id)}`, {
    method: "DELETE",
    headers: { prefer: "return=minimal" }
  });

  return response(200, {
    ok: true,
    deleted_member_id: member.id,
    deleted_member_name: member.name || "Member",
    deleted_phone: member.phone || "",
    deleted_bookings: relatedBookings?.length || 0
  });
}
