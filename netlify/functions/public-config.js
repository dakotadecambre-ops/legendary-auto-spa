const {
  response,
  optionsResponse
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "GET") return response(405, { error: "Method not allowed" });

  return response(200, {
    square_application_id: process.env.SQUARE_APPLICATION_ID || "",
    square_location_id: process.env.SQUARE_LOCATION_ID || "",
    square_environment: process.env.SQUARE_ENVIRONMENT || "sandbox",
    payments_enabled: Boolean(
      process.env.SQUARE_APPLICATION_ID &&
      process.env.SQUARE_LOCATION_ID &&
      process.env.SQUARE_ACCESS_TOKEN
    )
  });
};
