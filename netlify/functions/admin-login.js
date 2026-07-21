const {
  response,
  optionsResponse,
  parseJson,
  signAdminToken,
  supabaseConfigured,
  supabaseFetch,
  verifyPassword,
  adminSelectFields,
  normalizeAdminRole,
  isMissingSchemaError
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });

  const input = parseJson(event);
  if (!input) return response(400, { error: "Invalid JSON body" });
  if (!process.env.ADMIN_SESSION_SECRET) {
    return response(503, {
      error: "Admin auth is not configured yet.",
      setup_required: ["ADMIN_SESSION_SECRET"]
    });
  }

  if (!supabaseConfigured()) {
    return response(503, {
      error: "Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, run the schema, then create your first admin at /setup-admin.",
      setup_required: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "supabase/schema.sql", "/setup-admin"]
    });
  }

  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  if (!email || !password) return response(400, { error: "Email and password are required" });
  let adminUser = null;

  let users = null;
  try {
    users = await supabaseFetch(`admin_users?select=${adminSelectFields()}&email=eq.${encodeURIComponent(email)}&limit=1`, {
      method: "GET"
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return response(503, {
        error: "Supabase is connected, but admin users are not installed yet. Run supabase/schema.sql, then create your first admin at /setup-admin.",
        setup_required: ["supabase/schema.sql", "/setup-admin"]
      });
    }
    return response(500, { error: error.message });
  }
  adminUser = users?.[0] || null;

  if (!adminUser || !adminUser.active || !verifyPassword(password, adminUser.password_hash)) {
    return response(401, { error: "Invalid admin login" });
  }

  const token = signAdminToken({
    role: normalizeAdminRole(adminUser.role),
    email: adminUser.email,
    exp: Date.now() + 1000 * 60 * 60 * 12
  });

  return response(200, {
    ok: true,
    token,
    admin: {
      email: adminUser.email,
      role: normalizeAdminRole(adminUser.role)
    }
  });
};
