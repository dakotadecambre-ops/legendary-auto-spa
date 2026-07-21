const {
  response,
  optionsResponse,
  requireActiveAdmin,
  supabaseConfigured
} = require("./_shared");
const { handler: createBooking } = require("./create-booking");

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

  const sample = sampleBooking(admin.email || "admin");
  const result = await createBooking({
    ...event,
    httpMethod: "POST",
    body: JSON.stringify(sample)
  });

  const body = JSON.parse(result.body || "{}");
  return response(result.statusCode, {
    ...body,
    test_booking: true,
    sample
  });
};

function sampleBooking(createdBy) {
  const date = new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString().slice(0, 10);
  return {
    name: "Test Customer",
    phone: "+15555550123",
    email: "test.customer@example.com",
    year: "2023",
    make: "Mercedes-Benz",
    model: "GLE",
    size: "SUV / Crossover",
    tier: "Inside & Out Detail",
    startingPrice: "$115",
    focusArea: "Full Transformation",
    focusGoal: "Complete inside/outside reset for testing the admin workflow.",
    recommendedTier: "Executive Showroom Detail",
    addOns: "Pet Hair Removal $25+, Odor Removal $50",
    address: "123 Test Drive, Atlanta, GA",
    date,
    time: "Morning",
    notes: `Created from admin test button by ${createdBy}. Safe to delete after testing.`,
    paymentPreference: "Request now",
    createdAt: new Date().toISOString()
  };
}
