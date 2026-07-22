const crypto = require("crypto");

const jsonHeaders = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS"
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body)
  };
}

function optionsResponse() {
  return {
    statusCode: 204,
    headers: jsonHeaders,
    body: ""
  };
}

function parseJson(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

function normalizeBooking(input) {
  const now = new Date().toISOString();
  return {
    customer_name: clean(input.name),
    phone: clean(input.phone),
    email: clean(input.email),
    vehicle_year: clean(input.year),
    vehicle_make: clean(input.make),
    vehicle_model: clean(input.model),
    vehicle_size: clean(input.size),
    service_tier: clean(input.tier),
    starting_price: clean(input.startingPrice),
    focus_area: clean(input.focusArea),
    focus_goal: clean(input.focusGoal),
    recommended_tier: clean(input.recommendedTier),
    add_ons: clean(input.addOns),
    service_address: clean(input.address),
    preferred_date: clean(input.date),
    preferred_time: clean(input.time),
    notes: clean(input.notes),
    payment_preference: clean(input.paymentPreference),
    status: "new",
    payment_status: "not_started",
    created_at: input.createdAt || now,
    updated_at: now
  };
}

function clean(value) {
  if (value == null) return "";
  return String(value).trim().slice(0, 1000);
}

function validateBooking(booking) {
  const required = [
    ["customer_name", "Name"],
    ["phone", "Phone"],
    ["vehicle_make", "Vehicle make"],
    ["vehicle_model", "Vehicle model"],
    ["vehicle_size", "Vehicle size"],
    ["service_tier", "Service tier"],
    ["service_address", "Service address"],
    ["preferred_date", "Preferred date"],
    ["preferred_time", "Preferred time"]
  ];

  const missing = required
    .filter(([key]) => !booking[key])
    .map(([, label]) => label);

  return missing;
}

function detectSpamSubmission(input) {
  if (clean(input.company)) return "Spam check failed.";

  const startedAt = Date.parse(input.formStartedAt || "");
  if (Number.isFinite(startedAt)) {
    const ageMs = Date.now() - startedAt;
    if (ageMs >= 0 && ageMs < 2500) return "Please take a moment to review the request before submitting.";
  }

  return "";
}

async function recentBookingForPhone(booking) {
  const phone = clean(booking.phone);
  if (!phone) return null;

  const windowMs = Number(process.env.BOOKING_RATE_LIMIT_WINDOW_MS || 120000);
  const since = new Date(Date.now() - Math.max(windowMs, 30000)).toISOString();
  const rows = await supabaseFetch(
    `bookings?select=id,created_at&phone=eq.${encodeURIComponent(phone)}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1`,
    { method: "GET" }
  );

  return rows?.[0] || null;
}

async function createRelatedBookingRecords(savedBooking, booking) {
  const now = new Date().toISOString();
  const customerRows = await supabaseFetch("customers", {
    method: "POST",
    body: JSON.stringify({
      booking_id: savedBooking.id,
      name: booking.customer_name,
      phone: booking.phone,
      email: booking.email,
      created_at: now,
      updated_at: now
    })
  });
  const customer = customerRows?.[0] || null;

  const vehicleRows = await supabaseFetch("vehicles", {
    method: "POST",
    body: JSON.stringify({
      booking_id: savedBooking.id,
      customer_id: customer?.id || null,
      year: booking.vehicle_year,
      make: booking.vehicle_make,
      model: booking.vehicle_model,
      size: booking.vehicle_size,
      created_at: now,
      updated_at: now
    })
  });
  const vehicle = vehicleRows?.[0] || null;

  const locationRows = await supabaseFetch("service_locations", {
    method: "POST",
    body: JSON.stringify({
      booking_id: savedBooking.id,
      customer_id: customer?.id || null,
      address: booking.service_address,
      notes: booking.notes,
      created_at: now,
      updated_at: now
    })
  });
  const location = locationRows?.[0] || null;

  const jobRows = await supabaseFetch("jobs?on_conflict=booking_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      booking_id: savedBooking.id,
      customer_id: customer?.id || null,
      vehicle_id: vehicle?.id || null,
      service_location_id: location?.id || null,
      service_tier: booking.service_tier,
      starting_price: booking.starting_price,
      focus_area: booking.focus_area,
      focus_goal: booking.focus_goal,
      recommended_tier: booking.recommended_tier,
      add_ons: booking.add_ons,
      preferred_date: booking.preferred_date || null,
      preferred_time: booking.preferred_time,
      status: booking.status,
      assigned_to: booking.assigned_to || null,
      payment_status: booking.payment_status,
      payment_intent_id: booking.payment_intent_id || null,
      private_notes: booking.private_notes || null,
      created_at: now,
      updated_at: now
    })
  });

  return {
    customer_id: customer?.id || null,
    vehicle_id: vehicle?.id || null,
    service_location_id: location?.id || null,
    job_id: jobRows?.[0]?.id || null
  };
}

function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function isMissingSchemaError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return [
    "schema cache",
    "could not find the table",
    "relation",
    "does not exist",
    "column",
    "admin_users",
    "legendary_schema_constraints",
    "constraint"
  ].some((part) => message.includes(part));
}

function setupErrorResponse(error) {
  const message = String(error?.message || error || "");
  if (isMissingSchemaError(error)) {
    return response(503, {
      error: "Supabase schema is missing or outdated. Re-run supabase/schema.sql.",
      detail: message,
      setup_required: ["supabase/schema.sql"]
    });
  }

  if (/violates check constraint|violates foreign key constraint|violates not-null constraint/i.test(message)) {
    return response(422, {
      error: "Saved data did not match the required backend schema.",
      detail: message
    });
  }

  return response(500, { error: message || "Request failed" });
}

async function supabaseFetch(path, options = {}) {
  if (!supabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const base = process.env.SUPABASE_URL.replace(/\/$/, "");
  const url = `${base}/rest/v1/${path}`;
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
    prefer: "return=representation",
    ...(options.headers || {})
  };

  const result = await fetch(url, { ...options, headers });
  const text = await result.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!result.ok) {
    const message = typeof data === "string" ? data : data?.message || result.statusText;
    throw new Error(`Supabase request failed: ${message}`);
  }

  return data;
}

function tierAmountCents(tier, startingPrice) {
  const configuredHold = Number(process.env.DEFAULT_PREAUTH_AMOUNT_CENTS || 0);
  if (configuredHold > 0) return configuredHold;

  const match = String(startingPrice || "").match(/\d+(?:\.\d{1,2})?/);
  const numeric = Number(match?.[0] || 0);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric * 100);

  const packageMap = {
    "Signature Wash": 5500,
    "Interior Detail": 7500,
    "Inside & Out Detail": 9500,
    "Full Reset Detail": 14500,
    "Executive Showroom Detail": 22500
  };
  if (packageMap[tier]) return packageMap[tier];

  return 5500;
}

function squareConfigured() {
  return Boolean(
    process.env.SQUARE_APPLICATION_ID &&
    process.env.SQUARE_LOCATION_ID &&
    process.env.SQUARE_ACCESS_TOKEN
  );
}

function squareEnvironment() {
  return String(process.env.SQUARE_ENVIRONMENT || "sandbox").toLowerCase() === "production"
    ? "production"
    : "sandbox";
}

function squareApiBaseUrl() {
  return squareEnvironment() === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

function squareApiHeaders() {
  return {
    authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
    "content-type": "application/json",
    "Square-Version": process.env.SQUARE_VERSION || "2026-07-16"
  };
}

async function createSquareAuthorization(booking, sourceId) {
  if (!squareConfigured()) return null;
  if (!sourceId) throw new Error("Square payment token is required.");

  const amount = tierAmountCents(booking.service_tier, booking.starting_price);
  const payload = {
    idempotency_key: crypto.randomUUID(),
    source_id: sourceId,
    amount_money: {
      amount,
      currency: process.env.SQUARE_CURRENCY || "USD"
    },
    autocomplete: false,
    location_id: process.env.SQUARE_LOCATION_ID,
    reference_id: booking.id || booking.booking_id || "",
    note: `Legendary Auto Spa - ${booking.service_tier || "Detail request"}`,
    buyer_email_address: booking.email || undefined
  };

  const result = await fetch(`${squareApiBaseUrl()}/v2/payments`, {
    method: "POST",
    headers: squareApiHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    throw new Error(data?.errors?.[0]?.detail || data?.errors?.[0]?.code || "Square payment authorization failed.");
  }

  return data.payment;
}

async function completeSquarePayment(paymentId) {
  if (!squareConfigured()) return null;
  if (!paymentId) throw new Error("Square payment id is required.");

  const result = await fetch(`${squareApiBaseUrl()}/v2/payments/${encodeURIComponent(paymentId)}/complete`, {
    method: "POST",
    headers: squareApiHeaders(),
    body: JSON.stringify({})
  });

  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    throw new Error(data?.errors?.[0]?.detail || data?.errors?.[0]?.code || "Could not capture Square payment.");
  }

  return data.payment;
}

function mapSquarePaymentStatus(status) {
  const value = String(status || "").toUpperCase();
  if (value === "APPROVED") return "requires_capture";
  if (value === "COMPLETED") return "succeeded";
  if (value === "CANCELED") return "canceled";
  if (value === "FAILED") return "failed";
  return value ? "pending" : "not_started";
}

async function sendNotifications(booking) {
  const tasks = [];
  if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL_TO && process.env.ADMIN_EMAIL_FROM) {
    tasks.push(notificationTask("email", () => sendEmailNotification(booking)));
  }
  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER &&
    process.env.ADMIN_SMS_TO
  ) {
    tasks.push(notificationTask("sms", () => sendSmsNotification(booking)));
  }

  return Promise.all(tasks);
}

function notificationConfigStatus() {
  const emailMissing = ["RESEND_API_KEY", "ADMIN_EMAIL_FROM", "ADMIN_EMAIL_TO"]
    .filter((key) => !process.env[key]);
  const smsMissing = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "ADMIN_SMS_TO"]
    .filter((key) => !process.env[key]);

  return {
    email_ready: !emailMissing.length,
    sms_ready: !smsMissing.length,
    email_missing: emailMissing,
    sms_missing: smsMissing
  };
}

async function notificationTask(channel, task) {
  try {
    const result = await task();
    return { channel, ...result };
  } catch (error) {
    return {
      channel,
      ok: false,
      message: error.message || "Notification failed"
    };
  }
}

async function sendEmailNotification(booking) {
  const adminLink = booking.admin_url ? `<p><a href="${escapeHtml(booking.admin_url)}">Open admin dashboard</a></p>` : "";
  const html = `
    <h2>New Legendary Auto Spa request</h2>
    <p><strong>${escapeHtml(booking.customer_name)}</strong> requested ${escapeHtml(booking.service_tier)} at ${escapeHtml(booking.starting_price)}.</p>
    <p><strong>Phone:</strong> ${escapeHtml(booking.phone)}</p>
    ${booking.email ? `<p><strong>Email:</strong> ${escapeHtml(booking.email)}</p>` : ""}
    <p><strong>Vehicle:</strong> ${escapeHtml([booking.vehicle_year, booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" "))}</p>
    <p><strong>Vehicle type:</strong> ${escapeHtml(booking.vehicle_size)}</p>
    <p><strong>Focus:</strong> ${escapeHtml(booking.focus_area)}</p>
    ${booking.add_ons ? `<p><strong>Add-ons:</strong> ${escapeHtml(booking.add_ons)}</p>` : ""}
    <p><strong>Payment:</strong> ${escapeHtml(booking.payment_preference)} · ${escapeHtml(booking.payment_status)}</p>
    <p><strong>Address:</strong> ${escapeHtml(booking.service_address)}</p>
    <p><strong>Preferred:</strong> ${escapeHtml(`${booking.preferred_date} ${booking.preferred_time}`)}</p>
    ${booking.notes ? `<p><strong>Notes:</strong> ${escapeHtml(booking.notes)}</p>` : ""}
    ${adminLink}
  `;

  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.ADMIN_EMAIL_FROM,
      to: process.env.ADMIN_EMAIL_TO.split(",").map((item) => item.trim()),
      subject: `New detail request - ${booking.customer_name}`,
      html
    })
  });

  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(data?.message || "Email notification failed");
  return {
    ok: true,
    message: "Email notification sent",
    provider_id: data?.id || ""
  };
}

async function sendSmsNotification(booking) {
  const recipients = notificationRecipients(process.env.ADMIN_SMS_TO);
  if (!recipients.length) throw new Error("No admin SMS recipients are configured");

  const auth = Buffer
    .from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`)
    .toString("base64");

  const results = await Promise.all(recipients.map((recipient) => sendSmsToRecipient(booking, recipient, auth)));
  const failed = results.filter((result) => !result.ok);
  if (failed.length) {
    throw new Error(`SMS notification failed for ${failed.length} admin number${failed.length === 1 ? "" : "s"}`);
  }

  return {
    ok: true,
    message: `SMS notification sent to ${results.length} admin number${results.length === 1 ? "" : "s"}`,
    provider_id: results.map((result) => result.provider_id).filter(Boolean).join(",")
  };
}

async function sendSmsToRecipient(booking, recipient, auth) {
  const body = new URLSearchParams();
  body.set("From", process.env.TWILIO_FROM_NUMBER);
  body.set("To", recipient);
  body.set("Body", [
    `Pending Legendary request: ${booking.customer_name}`,
    `${booking.service_tier} ${booking.starting_price}`,
    `${booking.vehicle_size}: ${[booking.vehicle_year, booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" ")}`,
    booking.add_ons ? `Add-ons: ${booking.add_ons}` : null,
    `${booking.preferred_date} ${booking.preferred_time}`,
    booking.phone,
    booking.admin_url || null
  ].filter(Boolean).join(" | "));

  const result = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    return {
      ok: false,
      message: data?.message || "SMS notification failed"
    };
  }
  return {
    ok: true,
    message: "SMS notification sent",
    provider_id: data?.sid || ""
  };
}

function notificationRecipients(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function logBookingEvent(event) {
  const payload = {
    booking_id: event.booking_id || null,
    event_type: clean(event.event_type),
    channel: clean(event.channel),
    status: clean(event.status || "info"),
    message: clean(event.message),
    details: event.details || null,
    created_by: clean(event.created_by || "system")
  };

  return supabaseFetch("booking_events", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function signAdminToken(payload) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured.");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function signMemberToken(member) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured.");
  const payload = {
    kind: "member",
    id: member.id,
    phone: member.phone,
    name: member.name,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const iterations = 210000;
  const hash = crypto
    .pbkdf2Sync(String(password), salt, iterations, 32, "sha256")
    .toString("base64url");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith("pbkdf2_sha256$")) return false;
  const [, iterationsValue, salt, hash] = storedHash.split("$");
  const iterations = Number(iterationsValue);
  if (!iterations || !salt || !hash) return false;

  const candidate = crypto
    .pbkdf2Sync(String(password), salt, iterations, 32, "sha256")
    .toString("base64url");

  if (candidate.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

function adminSelectFields() {
  return "id,email,role,password_hash,active,created_at,updated_at";
}

function normalizeAdminRole(role) {
  const cleanRole = String(role || "viewer").trim().toLowerCase();
  return ["admin", "manager", "viewer"].includes(cleanRole) ? cleanRole : "viewer";
}

function adminHasRole(admin, allowedRoles) {
  const role = normalizeAdminRole(admin?.role);
  return allowedRoles.includes(role);
}

function verifyAdminToken(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !process.env.ADMIN_SESSION_SECRET) return null;

  const expected = crypto
    .createHmac("sha256", process.env.ADMIN_SESSION_SECRET)
    .update(encoded)
    .digest("base64url");

  if (signature.length !== expected.length) return null;
  const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return null;

  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Date.now()) return null;
  payload.role = normalizeAdminRole(payload.role);
  return payload;
}

function verifyMemberToken(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !process.env.ADMIN_SESSION_SECRET) return null;

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = crypto
    .createHmac("sha256", process.env.ADMIN_SESSION_SECRET)
    .update(encoded)
    .digest("base64url");

  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.kind !== "member" || !payload.id || !payload.phone || !payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

async function requireActiveMember(event) {
  const tokenMember = verifyMemberToken(event);
  if (!tokenMember) {
    return { errorResponse: response(401, { error: "Member sign-in required" }) };
  }

  try {
    const rows = await supabaseFetch(
      `member_accounts?select=id,name,phone,email,active,created_at,updated_at&id=eq.${encodeURIComponent(tokenMember.id)}&limit=1`,
      { method: "GET" }
    );
    const member = rows?.[0] || null;
    if (!member || !member.active) {
      return { errorResponse: response(401, { error: "Member account is inactive. Sign in again." }) };
    }
    return { member };
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return { errorResponse: response(503, { error: "Member schema is not installed yet." }) };
    }
    return { errorResponse: response(500, { error: error.message }) };
  }
}

async function requireActiveAdmin(event, allowedRoles = ["admin", "manager", "viewer"]) {
  const tokenAdmin = verifyAdminToken(event);
  if (!tokenAdmin) {
    return { errorResponse: response(401, { error: "Unauthorized" }) };
  }

  if (!supabaseConfigured()) {
    return { admin: tokenAdmin };
  }

  let users = null;
  try {
    users = await supabaseFetch(`admin_users?select=id,email,role,active&email=eq.${encodeURIComponent(tokenAdmin.email)}&limit=1`, {
      method: "GET"
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return { errorResponse: response(503, { error: "Admin users schema is not installed yet." }) };
    }
    return { errorResponse: response(500, { error: error.message }) };
  }

  const currentAdmin = users?.[0] || null;
  if (!currentAdmin || !currentAdmin.active) {
    return { errorResponse: response(401, { error: "Admin login is inactive. Log in again with an approved account." }) };
  }

  currentAdmin.role = normalizeAdminRole(currentAdmin.role);
  if (!adminHasRole(currentAdmin, allowedRoles)) {
    return { errorResponse: response(403, { error: "Admin role does not allow this action" }) };
  }

  return {
    admin: {
      ...tokenAdmin,
      id: currentAdmin.id,
      email: currentAdmin.email,
      role: currentAdmin.role
    }
  };
}

module.exports = {
  response,
  optionsResponse,
  parseJson,
  normalizeBooking,
  validateBooking,
  detectSpamSubmission,
  recentBookingForPhone,
  createRelatedBookingRecords,
  supabaseFetch,
  supabaseConfigured,
  isMissingSchemaError,
  setupErrorResponse,
  squareConfigured,
  squareEnvironment,
  createSquareAuthorization,
  completeSquarePayment,
  mapSquarePaymentStatus,
  sendNotifications,
  notificationConfigStatus,
  logBookingEvent,
  signAdminToken,
  verifyAdminToken,
  signMemberToken,
  verifyMemberToken,
  requireActiveMember,
  requireActiveAdmin,
  hashPassword,
  verifyPassword,
  adminSelectFields,
  normalizeAdminRole,
  adminHasRole
};
