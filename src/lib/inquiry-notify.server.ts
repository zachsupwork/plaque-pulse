/**
 * Best-effort staff notification. If no email provider is configured this does
 * nothing at all — the inquiry still lives in the database and shows in Admin.
 */
export async function notifyAdminsOfInquiry(inquiryId: string): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return;

  const recipients = (process.env["TAPLOCAL_ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!recipients.length) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("offering_inquiries")
    .select("id, name, email, phone, business_name, quantity_interest, message, offering_id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (!data) return;

  let offeringName = "TapLocal";
  if (data.offering_id) {
    const { data: o } = await supabaseAdmin
      .from("offerings")
      .select("name")
      .eq("id", data.offering_id)
      .maybeSingle();
    offeringName = o?.name ?? offeringName;
  }

  const lines = [
    "New TapLocal inquiry",
    "",
    `Offering: ${offeringName}`,
    `Name: ${data.name}`,
    `Business: ${data.business_name ?? "—"}`,
    `Email: ${data.email}`,
    `Phone: ${data.phone ?? "—"}`,
    `Quantity: ${data.quantity_interest ?? "—"}`,
    `Message: ${data.message ?? "—"}`,
  ];

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "TapLocal <onboarding@resend.dev>",
      to: recipients,
      subject: `New TapLocal Interest — ${offeringName}`,
      text: `${lines.join("\n")}\n\nView in TapLocal Admin: /admin/inquiries/${data.id}`,
    }),
  });
}
