const {
  response,
  optionsResponse,
  requireActiveAdmin,
  supabaseConfigured,
  sendNotifications,
  notificationConfigStatus,
  logBookingEvent
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });

  const auth = await requireActiveAdmin(event, ["admin", "manager"]);
  if (auth.errorResponse) return auth.errorResponse;
  const admin = auth.admin;
  if (!supabaseConfigured()) {
    return response(503, {
      error: "Backend database is not configured yet.",
      setup_required: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    });
  }

  const sample = sampleNotification(admin.email || "admin", siteBaseUrl(event));
  const notifications = await sendNotifications(sample);

  if (!notifications.length) {
    await safeLogBookingEvent({
      event_type: "notification_test",
      status: "warning",
      message: "No email or SMS notification provider is configured for the test.",
      details: notificationConfigStatus(),
      created_by: admin.email || "admin"
    });
    return response(200, {
      ok: false,
      notifications: [],
      config: notificationConfigStatus()
    });
  }

  await Promise.all(notifications.map((notification) => safeLogBookingEvent({
    event_type: "notification_test",
    channel: notification.channel,
    status: notification.ok ? "success" : "error",
    message: notification.message,
    details: {
      ok: notification.ok,
      provider_id: notification.provider_id || null
    },
    created_by: admin.email || "admin"
  })));

  return response(200, {
    ok: notifications.every((notification) => notification.ok),
    notifications
  });
};

function sampleNotification(createdBy, baseUrl) {
  const date = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString().slice(0, 10);
  return {
    id: "notification-test",
    customer_name: "Legendary Test Notification",
    phone: "+15555550123",
    email: "test.customer@example.com",
    vehicle_year: "2024",
    vehicle_make: "Mercedes-Benz",
    vehicle_model: "S-Class",
    vehicle_size: "Car / Sedan / Coupe",
    service_tier: "Notification Test",
    starting_price: "$0",
    focus_area: "Backend verification",
    add_ons: "",
    service_address: "Admin dashboard test",
    preferred_date: date,
    preferred_time: "Morning",
    notes: `Notification test sent by ${createdBy}.`,
    payment_preference: "Request now",
    payment_status: "not_started",
    admin_url: baseUrl ? `${baseUrl}/admin` : ""
  };
}

async function safeLogBookingEvent(event) {
  try {
    await logBookingEvent(event);
  } catch (error) {
    console.error("Notification test event log failed", error.message);
  }
}

function siteBaseUrl(event) {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, "");
  const host = event.headers["x-forwarded-host"] || event.headers.host || event.headers.Host || "";
  const protocol = event.headers["x-forwarded-proto"] || "https";
  return host ? `${protocol}://${host}` : "";
}
