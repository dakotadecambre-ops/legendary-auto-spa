const {
  response,
  optionsResponse,
  parseJson,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse,
  requireActiveMember,
  normalizeNotificationPreference,
  smsOptIn,
  pushEnabled,
  saveCustomerPushSubscription
} = require("./_shared");

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (!["GET", "PATCH"].includes(event.httpMethod)) return response(405, { error: "Method not allowed" });
  if (!supabaseConfigured()) return response(503, { error: "Supabase is not configured." });

  const { member, errorResponse } = await requireActiveMember(event);
  if (errorResponse) return errorResponse;

  try {
    if (event.httpMethod === "PATCH") {
      const input = parseJson(event);
      if (!input) return response(400, { error: "Invalid JSON body" });
      await updateMember(member, input);
    }

    const profile = await getMemberProfile(member.id);
    const requests = await getRecentRequests(member.phone);
    return response(200, { ok: true, member: profile, requests });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

function clean(value) {
  return String(value || "").trim().slice(0, 1000);
}

function normalizeVehicles(value) {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((vehicle) => ({
      year: clean(vehicle.year),
      make: clean(vehicle.make),
      model: clean(vehicle.model),
      size: clean(vehicle.size),
      notes: clean(vehicle.notes),
      is_default: Boolean(vehicle.is_default)
    }))
    .filter((vehicle) => vehicle.make || vehicle.model)
    .slice(0, 12);
}

function normalizeLocations(value) {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((location) => ({
      label: clean(location.label || "Saved location"),
      address: clean(location.address),
      notes: clean(location.notes),
      is_default: Boolean(location.is_default)
    }))
    .filter((location) => location.address)
    .slice(0, 12);
}

async function updateMember(member, input) {
  const memberId = member.id;
  const now = new Date().toISOString();
  const nextPreference = input.notificationPreference
    ? normalizeNotificationPreference(input.notificationPreference)
    : undefined;
  await supabaseFetch(`member_accounts?id=eq.${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: clean(input.name),
      email: clean(input.email),
      ...(nextPreference ? {
        notification_preference: nextPreference,
        sms_opt_in: smsOptIn(input.smsOptIn, nextPreference),
        push_enabled: pushEnabled(input.pushEnabled, nextPreference)
      } : {}),
      updated_at: now
    })
  });

  if (input?.pushSubscription?.endpoint) {
    await saveCustomerPushSubscription({
      phone: member.phone,
      memberId,
      notificationPreference: nextPreference || member.notification_preference,
      subscription: input.pushSubscription,
      userAgent: input.pushUserAgent,
      deviceLabel: input.pushDeviceLabel
    });
  }

  if (Array.isArray(input.vehicles)) {
    await supabaseFetch(`member_vehicles?member_id=eq.${encodeURIComponent(memberId)}`, {
      method: "DELETE",
      headers: { prefer: "return=minimal" }
    });
    const vehicles = normalizeVehicles(input.vehicles);
    if (vehicles.length) {
      await supabaseFetch("member_vehicles", {
        method: "POST",
        body: JSON.stringify(vehicles.map((vehicle, index) => ({
          ...vehicle,
          member_id: memberId,
          is_default: index === 0,
          created_at: now,
          updated_at: now
        })))
      });
    }
  }

  if (Array.isArray(input.locations)) {
    await supabaseFetch(`member_locations?member_id=eq.${encodeURIComponent(memberId)}`, {
      method: "DELETE",
      headers: { prefer: "return=minimal" }
    });
    const locations = normalizeLocations(input.locations);
    if (locations.length) {
      await supabaseFetch("member_locations", {
        method: "POST",
        body: JSON.stringify(locations.map((location, index) => ({
          ...location,
          member_id: memberId,
          is_default: index === 0,
          created_at: now,
          updated_at: now
        })))
      });
    }
  }
}

async function getMemberProfile(memberId) {
  const [members, vehicles, locations] = await Promise.all([
    supabaseFetch(
      `member_accounts?select=id,name,phone,email,notification_preference,sms_opt_in,push_enabled,active,created_at,updated_at&id=eq.${encodeURIComponent(memberId)}&limit=1`,
      { method: "GET" }
    ),
    supabaseFetch(`member_vehicles?select=id,year,make,model,size,notes,is_default,created_at,updated_at&member_id=eq.${encodeURIComponent(memberId)}&order=created_at.asc`, { method: "GET" }),
    supabaseFetch(`member_locations?select=id,label,address,notes,is_default,created_at,updated_at&member_id=eq.${encodeURIComponent(memberId)}&order=created_at.asc`, { method: "GET" })
  ]);
  return { ...(members?.[0] || {}), vehicles: vehicles || [], locations: locations || [] };
}

async function getRecentRequests(phone) {
  return supabaseFetch(
    `bookings?select=id,customer_name,phone,email,vehicle_year,vehicle_make,vehicle_model,vehicle_size,service_tier,starting_price,focus_area,focus_goal,add_ons,service_address,preferred_date,preferred_time,notes,payment_preference,notification_preference,sms_opt_in,push_enabled,payment_status,status,created_at&phone=eq.${encodeURIComponent(phone)}&order=created_at.desc&limit=25`,
    { method: "GET" }
  );
}
