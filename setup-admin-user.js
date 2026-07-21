const {
  response,
  optionsResponse,
  parseJson,
  supabaseFetch,
  supabaseConfigured,
  hashPassword,
  normalizeAdminRole,
  isMissingSchemaError
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });
  if (!process.env.ADMIN_SETUP_KEY) return response(503, { error: "ADMIN_SETUP_KEY is not configured" });
  if (!supabaseConfigured()) return response(503, { error: "Supabase is not configured" });

  const input = parseJson(event);
  if (!input) return response(400, { error: "Invalid JSON body" });
  if (input.setup_key !== process.env.ADMIN_SETUP_KEY) return response(401, { error: "Invalid setup key" });

  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  const role = normalizeAdminRole(input.role || "admin");
  if (!email || !email.includes("@")) return response(400, { error: "Valid email is required" });
  if (password.length < 10) return response(400, { error: "Password must be at least 10 characters" });

  const user = {
    email,
    role,
    password_hash: hashPassword(password),
    active: true,
    updated_at: new Date().toISOString()
  };

  try {
    const result = await supabaseFetch("admin_users?on_conflict=email", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(user)
    });

    return response(200, {
      ok: true,
      admin_user: {
        id: result?.[0]?.id,
        email: result?.[0]?.email,
        role: result?.[0]?.role,
        active: result?.[0]?.active
      }
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return response(503, {
        error: "Supabase is connected, but the Legendary Auto Spa schema is not installed yet. Run supabase/schema.sql first.",
        setup_required: ["supabase/schema.sql"]
      });
    }
    return response(500, { error: error.message });
  }
};
