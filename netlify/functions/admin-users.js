const {
  response,
  optionsResponse,
  parseJson,
  supabaseFetch,
  supabaseConfigured,
  requireActiveAdmin,
  setupErrorResponse,
  hashPassword
} = require("./_shared");

const publicFields = "id,email,role,active,created_at,updated_at";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  const auth = await requireActiveAdmin(event, ["admin"]);
  if (auth.errorResponse) return auth.errorResponse;
  if (!supabaseConfigured()) return response(503, { error: "Supabase is not configured" });

  try {
    if (event.httpMethod === "GET") {
      const users = await supabaseFetch(`admin_users?select=${publicFields}&order=email.asc`, {
        method: "GET"
      });
      return response(200, { ok: true, admin_users: users || [] });
    }

    if (event.httpMethod !== "POST" && event.httpMethod !== "PATCH") {
      return response(405, { error: "Method not allowed" });
    }

    const input = parseJson(event);
    if (!input) return response(400, { error: "Invalid JSON body" });

    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    const role = cleanRole(input.role);
    const active = input.active !== false;

    if (!email || !email.includes("@")) return response(400, { error: "Valid email is required" });

    const existing = await supabaseFetch(`admin_users?select=id,email,role,active,password_hash&email=eq.${encodeURIComponent(email)}&limit=1`, {
      method: "GET"
    });
    const existingUser = existing?.[0] || null;

    if (!existingUser && password.length < 10) {
      return response(400, { error: "New admins need a password of at least 10 characters" });
    }

    if (password && password.length < 10) {
      return response(400, { error: "Password must be at least 10 characters" });
    }

    if (existingUser && existingUser.role === "admin" && (!active || role !== "admin")) {
      const activeAdmins = await supabaseFetch("admin_users?select=id,email&role=eq.admin&active=eq.true", {
        method: "GET"
      });
      const otherActiveAdmins = (activeAdmins || [])
        .filter((user) => user.email !== existingUser.email);
      if (!otherActiveAdmins.length) {
        return response(409, {
          error: "At least one active admin owner must remain. Add another admin before downgrading or deactivating this one."
        });
      }
    }

    const adminUser = {
      email,
      role,
      active,
      updated_at: new Date().toISOString()
    };

    if (password) adminUser.password_hash = hashPassword(password);

    const result = existingUser
      ? await supabaseFetch(`admin_users?email=eq.${encodeURIComponent(email)}`, {
        method: "PATCH",
        body: JSON.stringify(adminUser)
      })
      : await supabaseFetch("admin_users?on_conflict=email", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(adminUser)
      });

    const saved = result?.[0] || {};
    return response(200, {
      ok: true,
      admin_user: {
        id: saved.id,
        email: saved.email,
        role: saved.role,
        active: saved.active,
        created_at: saved.created_at,
        updated_at: saved.updated_at
      }
    });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

function cleanRole(value) {
  const role = String(value || "admin").trim().toLowerCase();
  return ["admin", "manager", "viewer"].includes(role) ? role : "admin";
}
