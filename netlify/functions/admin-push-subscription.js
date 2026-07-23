const {
  response,
  optionsResponse,
  parseJson,
  requireActiveAdmin,
  pushConfigured,
  saveAdminPushSubscription,
  deleteAdminPushSubscription,
  setupErrorResponse
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  const auth = await requireActiveAdmin(event, ["admin", "manager", "viewer"]);
  if (auth.errorResponse) return auth.errorResponse;

  if (!pushConfigured()) {
    return response(503, {
      error: "Web push is not configured yet.",
      setup_required: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]
    });
  }

  const input = parseJson(event);
  if (input == null) return response(400, { error: "Invalid JSON body" });

  try {
    if (event.httpMethod === "POST") {
      if (!validSubscription(input.subscription)) {
        return response(400, { error: "Valid push subscription data is required" });
      }

      const saved = await saveAdminPushSubscription(auth.admin, input.subscription, {
        user_agent: input.user_agent || event.headers["user-agent"] || event.headers["User-Agent"] || "",
        device_label: input.device_label || ""
      });

      return response(200, {
        ok: true,
        subscription_id: saved?.id || null
      });
    }

    if (event.httpMethod === "DELETE") {
      const endpoint = String(input.endpoint || "").trim();
      if (!endpoint) return response(400, { error: "Subscription endpoint is required" });
      await deleteAdminPushSubscription(endpoint);
      return response(200, { ok: true });
    }

    return response(405, { error: "Method not allowed" });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

function validSubscription(subscription) {
  return Boolean(
    subscription &&
    typeof subscription.endpoint === "string" &&
    subscription.endpoint &&
    subscription.keys &&
    typeof subscription.keys.p256dh === "string" &&
    typeof subscription.keys.auth === "string"
  );
}
