const {
  response,
  optionsResponse,
  requireActiveAdmin,
  supabaseConfigured,
  supabaseFetch
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "GET") return response(405, { error: "Method not allowed" });

  const auth = await requireActiveAdmin(event);
  if (auth.errorResponse) return auth.errorResponse;

  const checks = {
    netlify_functions: {
      ok: true,
      label: "Netlify Functions",
      detail: "Function runtime is responding."
    },
    supabase: {
      ok: supabaseConfigured(),
      label: "Supabase database",
      detail: supabaseConfigured() ? "Environment variables are present." : "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    },
    supabase_schema: {
      ok: false,
      label: "Supabase schema",
      detail: supabaseConfigured() ? "Schema tables have not been checked yet." : "Waiting on Supabase configuration."
    },
    admin_auth: {
      ok: Boolean(process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SETUP_KEY),
      label: "Admin authentication",
      detail: process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SETUP_KEY
        ? "Session signing and setup key are configured."
        : "Missing ADMIN_SESSION_SECRET or ADMIN_SETUP_KEY."
    },
    stripe: {
      ok: Boolean(process.env.STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_SECRET_KEY),
      label: "Stripe payments",
      detail: process.env.STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_SECRET_KEY
        ? "Stripe publishable and secret keys are configured."
        : "Missing STRIPE_PUBLISHABLE_KEY or STRIPE_SECRET_KEY."
    },
    stripe_webhook: {
      ok: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      label: "Stripe webhook",
      detail: process.env.STRIPE_WEBHOOK_SECRET ? "Webhook secret is configured." : "Missing STRIPE_WEBHOOK_SECRET."
    },
    email_notifications: {
      ok: Boolean(process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL_FROM && process.env.ADMIN_EMAIL_TO),
      label: "Email notifications",
      detail: process.env.RESEND_API_KEY ? "Resend key is present." : "Missing Resend email settings."
    },
    sms_notifications: {
      ok: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER && process.env.ADMIN_SMS_TO),
      label: "SMS notifications",
      detail: process.env.TWILIO_ACCOUNT_SID ? "Twilio account setting is present." : "Missing Twilio SMS settings."
    }
  };

  if (checks.supabase.ok) {
    try {
      await supabaseFetch("bookings?select=id&limit=1", { method: "GET" });
      checks.supabase.detail = "Database connection is reachable.";
      const schemaResult = await checkRequiredSchema();
      checks.supabase_schema.ok = schemaResult.ok;
      checks.supabase_schema.detail = schemaResult.detail;
      const constraintsResult = await checkRequiredConstraints();
      checks.supabase_constraints = {
        ok: constraintsResult.ok,
        label: "Supabase constraints",
        detail: constraintsResult.detail
      };
    } catch (error) {
      checks.supabase.ok = false;
      checks.supabase.detail = error.message;
      checks.supabase_schema.ok = false;
      checks.supabase_schema.detail = "Could not verify schema because the database connection check failed.";
      checks.supabase_constraints = {
        ok: false,
        label: "Supabase constraints",
        detail: "Could not verify constraints because the database connection check failed."
      };
    }
  }

  const complete = Object.values(checks).every((check) => check.ok);
  return response(200, {
    ok: complete,
    checked_at: new Date().toISOString(),
    checks
  });
};

async function checkRequiredConstraints() {
  const requiredConstraints = [
    "bookings_status_check",
    "bookings_payment_status_check",
    "jobs_status_check",
    "jobs_payment_status_check",
    "admin_users_role_check"
  ];

  try {
    const rows = await supabaseFetch(
      `legendary_schema_constraints?select=conname&conname=in.(${requiredConstraints.join(",")})`,
      { method: "GET" }
    );
    const found = new Set((rows || []).map((row) => row.conname));
    const missing = requiredConstraints.filter((constraint) => !found.has(constraint));
    if (missing.length) {
      return {
        ok: false,
        detail: `Missing constraints: ${missing.join(", ")}. Re-run supabase/schema.sql.`
      };
    }
    return {
      ok: true,
      detail: "Required role, booking status, and payment status constraints are installed."
    };
  } catch (error) {
    return {
      ok: false,
      detail: `Could not verify constraints. Re-run supabase/schema.sql. ${error.message}`
    };
  }
}

async function checkRequiredSchema() {
  const requiredTables = [
    {
      table: "bookings",
      columns: [
        "id", "customer_name", "phone", "email", "vehicle_year", "vehicle_make", "vehicle_model",
        "vehicle_size", "service_tier", "starting_price", "focus_area", "focus_goal",
        "recommended_tier", "add_ons", "service_address", "preferred_date", "preferred_time",
        "notes", "payment_preference", "payment_status", "payment_intent_id", "status",
        "assigned_to", "private_notes", "created_at", "updated_at"
      ]
    },
    {
      table: "customers",
      columns: ["id", "booking_id", "name", "phone", "email", "created_at", "updated_at"]
    },
    {
      table: "vehicles",
      columns: ["id", "booking_id", "customer_id", "year", "make", "model", "size", "created_at", "updated_at"]
    },
    {
      table: "service_locations",
      columns: ["id", "booking_id", "customer_id", "address", "notes", "created_at", "updated_at"]
    },
    {
      table: "jobs",
      columns: [
        "id", "booking_id", "customer_id", "vehicle_id", "service_location_id", "service_tier",
        "starting_price", "focus_area", "focus_goal", "recommended_tier", "add_ons",
        "preferred_date", "preferred_time", "status", "assigned_to", "payment_status",
        "payment_intent_id", "private_notes", "created_at", "updated_at"
      ]
    },
    {
      table: "booking_events",
      columns: ["id", "booking_id", "event_type", "channel", "status", "message", "details", "created_by", "created_at"]
    },
    {
      table: "admin_users",
      columns: ["id", "email", "role", "password_hash", "active", "created_at", "updated_at"]
    },
    {
      table: "member_accounts",
      columns: ["id", "name", "phone", "email", "password_hash", "active", "created_at", "updated_at"]
    },
    {
      table: "member_vehicles",
      columns: ["id", "member_id", "year", "make", "model", "size", "notes", "is_default", "created_at", "updated_at"]
    },
    {
      table: "member_locations",
      columns: ["id", "member_id", "label", "address", "notes", "is_default", "created_at", "updated_at"]
    },
    {
      table: "member_sessions",
      columns: ["id", "member_id", "token_hash", "user_agent", "expires_at", "created_at", "last_seen_at"]
    }
  ];

  for (const item of requiredTables) {
    try {
      await supabaseFetch(`${item.table}?select=${item.columns.join(",")}&limit=1`, { method: "GET" });
    } catch (error) {
      return {
        ok: false,
        detail: `${item.table} is missing or does not match the required columns. ${error.message}`
      };
    }
  }

  return {
    ok: true,
    detail: "Required booking, admin, and member account columns are reachable."
  };
}
