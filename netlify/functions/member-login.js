const {
  response,
  optionsResponse,
  parseJson,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse,
  verifyPassword,
  signMemberToken
} = require("./_shared");

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });
  if (!supabaseConfigured()) return response(503, { error: "Supabase is not configured." });

  const input = parseJson(event);
  if (!input) return response(400, { error: "Invalid JSON body" });

  const phone = normalizePhone(input.phone);
  const password = String(input.password || "");
  if (phone.length < 10 || password.length < 6) {
    return response(422, { error: "Enter a valid phone number and password." });
  }

  try {
    const rows = await supabaseFetch(
      `member_accounts?select=id,name,phone,email,password_hash,active,created_at,updated_at&phone=eq.${encodeURIComponent(phone)}&limit=1`,
      { method: "GET" }
    );
    const member = rows?.[0] || null;
    if (!member || !member.active || !verifyPassword(password, member.password_hash)) {
      return response(401, { error: "No matching member account found. Check the phone and password." });
    }

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

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

async function getMemberProfile(memberId) {
  const [members, vehicles, locations] = await Promise.all([
    supabaseFetch(
      `member_accounts?select=id,name,phone,email,active,created_at,updated_at&id=eq.${encodeURIComponent(memberId)}&limit=1`,
      { method: "GET" }
    ),
    supabaseFetch(`member_vehicles?select=id,year,make,model,size,notes,is_default,created_at,updated_at&member_id=eq.${encodeURIComponent(memberId)}&order=created_at.asc`, { method: "GET" }),
    supabaseFetch(`member_locations?select=id,label,address,notes,is_default,created_at,updated_at&member_id=eq.${encodeURIComponent(memberId)}&order=created_at.asc`, { method: "GET" })
  ]);
  return { ...(members?.[0] || {}), vehicles: vehicles || [], locations: locations || [] };
}
