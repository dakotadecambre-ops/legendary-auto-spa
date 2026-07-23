const {
  response,
  optionsResponse,
  parseJson,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse,
  hashPassword,
  signMemberToken,
  normalizeNotificationPreference,
  smsOptIn,
  pushEnabled,
  saveCustomerPushSubscription
} = require("./_shared");

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });
  if (!supabaseConfigured()) return response(503, { error: "Supabase is not configured." });

  const input = parseJson(event);
  if (!input) return response(400, { error: "Invalid JSON body" });

  const phone = normalizePhone(input.phone);
  const password = String(input.password || "");
  const name = clean(input.name);
  if (!name || phone.length < 10 || password.length < 6) {
    return response(422, { error: "Name, valid phone, and 6+ character password are required." });
  }

  try {
    const existing = await supabaseFetch(
      `member_accounts?select=id&phone=eq.${encodeURIComponent(phone)}&limit=1`,
      { method: "GET" }
    );
    if (existing?.length) return response(409, { error: "That phone already has a member account." });

    const now = new Date().toISOString();
    const notificationPreference = normalizeNotificationPreference(input.notificationPreference);
    const rows = await supabaseFetch("member_accounts", {
      method: "POST",
      body: JSON.stringify({
        name,
        phone,
        email: clean(input.email),
        password_hash: hashPassword(password),
        notification_preference: notificationPreference,
        sms_opt_in: smsOptIn(input.smsOptIn, notificationPreference),
        push_enabled: pushEnabled(input.pushEnabled, notificationPreference),
        active: true,
        created_at: now,
        updated_at: now
      })
    });
    const member = rows?.[0];
    if (!member?.id) throw new Error("Member account could not be created.");

    await replaceMemberVehicles(member.id, normalizeVehicles(input.vehicles || input.vehicle));
    await replaceMemberLocations(member.id, normalizeLocations(input.locations || input.location));
    await saveMemberPushSubscription(member, input);

    const profile = await getMemberProfile(member.id);
    return response(200, {
      ok: true,
      token: signMemberToken(member),
      member: profile
    });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

function clean(value) {
  return String(value || "").trim().slice(0, 1000);
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeVehicles(value) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
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
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items
    .map((location) => ({
      label: clean(location.label || "Primary"),
      address: clean(location.address),
      notes: clean(location.notes),
      is_default: Boolean(location.is_default)
    }))
    .filter((location) => location.address)
    .slice(0, 12);
}

async function replaceMemberVehicles(memberId, vehicles) {
  if (!vehicles.length) return;
  const now = new Date().toISOString();
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

async function replaceMemberLocations(memberId, locations) {
  if (!locations.length) return;
  const now = new Date().toISOString();
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

async function getMemberProfile(memberId) {
  const members = await supabaseFetch(
    `member_accounts?select=id,name,phone,email,notification_preference,sms_opt_in,push_enabled,active,created_at,updated_at&id=eq.${encodeURIComponent(memberId)}&limit=1`,
    { method: "GET" }
  );
  const member = members?.[0] || null;
  if (!member) return null;
  const [vehicles, locations] = await Promise.all([
    supabaseFetch(`member_vehicles?select=id,year,make,model,size,notes,is_default,created_at,updated_at&member_id=eq.${encodeURIComponent(memberId)}&order=created_at.asc`, { method: "GET" }),
    supabaseFetch(`member_locations?select=id,label,address,notes,is_default,created_at,updated_at&member_id=eq.${encodeURIComponent(memberId)}&order=created_at.asc`, { method: "GET" })
  ]);
  return { ...member, vehicles: vehicles || [], locations: locations || [] };
}

async function saveMemberPushSubscription(member, input) {
  if (!input?.pushSubscription?.endpoint || !member?.phone) return;
  await saveCustomerPushSubscription({
    phone: member.phone,
    memberId: member.id,
    notificationPreference: input.notificationPreference,
    subscription: input.pushSubscription,
    userAgent: input.pushUserAgent,
    deviceLabel: input.pushDeviceLabel
  });
}
