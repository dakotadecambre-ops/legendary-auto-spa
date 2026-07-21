const {
  response,
  optionsResponse
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "GET") return response(405, { error: "Method not allowed" });

  return response(200, {
    stripe_publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || "",
    payments_enabled: Boolean(process.env.STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_SECRET_KEY)
  });
};
