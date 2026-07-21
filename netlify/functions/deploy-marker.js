const {
  response,
  optionsResponse
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "GET") return response(405, { error: "Method not allowed" });

  return response(200, {
    build_label: "live-backend-admin-setup",
    app: "legendary-auto-spa",
    functions_root: "netlify/functions",
    backend_ready_shape: true,
    updated_at: "2026-07-21"
  });
};
