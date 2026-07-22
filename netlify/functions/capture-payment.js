const {
  response,
  optionsResponse,
  parseJson,
  requireActiveAdmin,
  supabaseFetch,
  supabaseConfigured,
  setupErrorResponse,
  squareConfigured,
  completeSquarePayment,
  mapSquarePaymentStatus,
  logBookingEvent
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });

  const auth = await requireActiveAdmin(event, ["admin"]);
  if (auth.errorResponse) return auth.errorResponse;
  const admin = auth.admin;
  if (!squareConfigured()) return response(503, { error: "Square payment settings are not configured" });
  if (!supabaseConfigured()) return response(503, { error: "Supabase is not configured" });

  const input = parseJson(event);
  if (!input?.id || !input?.payment_intent_id) {
    return response(400, { error: "Booking id and Square payment id are required" });
  }

  try {
    const bookingRows = await supabaseFetch(
      `bookings?select=*&id=eq.${encodeURIComponent(input.id)}&payment_intent_id=eq.${encodeURIComponent(input.payment_intent_id)}&limit=1`,
      { method: "GET" }
    );
    const bookingMatch = bookingRows?.[0] || null;
    if (!bookingMatch) {
      return response(404, { error: "No matching booking/payment authorization was found" });
    }
    if (bookingMatch.payment_status === "succeeded") {
      return response(409, { error: "Payment has already been captured" });
    }

    const squarePayment = await completeSquarePayment(input.payment_intent_id);
    const paymentStatus = mapSquarePaymentStatus(squarePayment.status);
    const receipt = buildReceipt(bookingMatch, squarePayment, admin);
    receipt.pdf_filename = `${receipt.receipt_id}.pdf`;
    receipt.pdf_base64 = createReceiptPdfBase64(receipt);

    const updated = await supabaseFetch(`bookings?id=eq.${encodeURIComponent(input.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        payment_status: paymentStatus,
        status: paymentStatus === "succeeded" ? "complete" : bookingMatch.status,
        updated_at: new Date().toISOString()
      })
    });
    const booking = updated?.[0] || null;
    await safeSyncJob(input.id, {
      status: paymentStatus === "succeeded" ? "complete" : bookingMatch.status,
      payment_status: paymentStatus,
      payment_intent_id: input.payment_intent_id,
      updated_at: new Date().toISOString()
    });

    await safeLogBookingEvent({
      booking_id: input.id,
      event_type: "payment_captured",
      channel: "square",
      status: "success",
      message: "Admin captured the authorized payment.",
      details: {
        square_payment_id: input.payment_intent_id,
        square_status: squarePayment.status,
        amount_money: squarePayment.amount_money || null,
        total_money: squarePayment.total_money || null,
        captured_by: admin.email || "admin",
        receipt
      },
      created_by: admin.email || "admin"
    });

    return response(200, { ok: true, square: squarePayment, booking, receipt });
  } catch (error) {
    return setupErrorResponse(error);
  }
};

async function safeLogBookingEvent(event) {
  try {
    await logBookingEvent(event);
  } catch (error) {
    console.error("Capture event log failed", error.message);
  }
}

async function safeSyncJob(bookingId, update) {
  try {
    await supabaseFetch(`jobs?booking_id=eq.${encodeURIComponent(bookingId)}`, {
      method: "PATCH",
      body: JSON.stringify(update)
    });
  } catch (error) {
    console.error("Capture job sync failed", error.message);
  }
}

function buildReceipt(booking, squarePayment, admin) {
  const money = squarePayment.total_money || squarePayment.amount_money || {};
  const amountCents = Number(money.amount || 0);
  const currency = money.currency || "USD";
  const capturedAt = new Date().toISOString();
  const reference = String(booking.id || "").split("-")[0].toUpperCase();

  return {
    receipt_id: `LAS-${reference || Date.now()}`,
    booking_id: booking.id,
    square_payment_id: squarePayment.id,
    square_receipt_url: squarePayment.receipt_url || "",
    square_status: squarePayment.status,
    customer_name: booking.customer_name || "",
    phone: booking.phone || "",
    email: booking.email || "",
    service_tier: booking.service_tier || "",
    vehicle: [booking.vehicle_year, booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" "),
    vehicle_size: booking.vehicle_size || "",
    service_address: booking.service_address || "",
    preferred_date: booking.preferred_date || "",
    preferred_time: booking.preferred_time || "",
    add_ons: booking.add_ons || "",
    amount_cents: amountCents,
    amount_label: formatMoney(amountCents, currency),
    currency,
    captured_at: capturedAt,
    captured_by: admin.email || "admin"
  };
}

function createReceiptPdfBase64(receipt) {
  const lines = [
    "Legendary Auto Spa",
    "Payment Receipt",
    `Receipt: ${receipt.receipt_id}`,
    `Captured: ${formatReceiptDate(receipt.captured_at)}`,
    `Amount: ${receipt.amount_label}`,
    `Customer: ${receipt.customer_name}`,
    `Phone: ${receipt.phone}`,
    `Email: ${receipt.email}`,
    `Package: ${receipt.service_tier}`,
    `Vehicle: ${[receipt.vehicle, receipt.vehicle_size].filter(Boolean).join(" - ")}`,
    `Add-ons: ${receipt.add_ons || "None"}`,
    `Address: ${receipt.service_address}`,
    `Schedule: ${[receipt.preferred_date, receipt.preferred_time].filter(Boolean).join(" ")}`,
    `Square Payment: ${receipt.square_payment_id}`,
    `Square Receipt: ${receipt.square_receipt_url || "Not provided"}`,
    `Captured by: ${receipt.captured_by}`
  ];

  const textCommands = lines.map((line, index) => {
    const size = index === 0 ? 20 : index === 1 ? 16 : 11;
    const y = 760 - index * 28;
    return `BT /F1 ${size} Tf 54 ${y} Td (${escapePdfText(line)}) Tj ET`;
  }).join("\n");

  return Buffer.from(buildPdf(textCommands), "binary").toString("base64");
}

function buildPdf(content) {
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(pdf.length);
    pdf += object;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function formatReceiptDate(value) {
  return value ? new Date(value).toLocaleString("en-US") : "";
}

function formatMoney(amountCents, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD"
  }).format((Number(amountCents) || 0) / 100);
}
