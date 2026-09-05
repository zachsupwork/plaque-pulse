import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Resolve a public plaque slug to its live destination and record the interaction. */
export async function resolveAndRedirect(slug: string, source: "nfc" | "qr", request: Request) {
  // Manufacturing and support taps carry tl_test=1 and must never touch customer numbers.
  const isTest = new URL(request.url).searchParams.get("tl_test") === "1";

  const { data: plaque } = await supabaseAdmin
    .from("plaques")
    .select("id, business_id, status")
    .eq("public_slug", slug)
    .maybeSingle();

  if (!plaque) return fallback("We couldn't find this plaque", "Check the code on the plaque and try again.");
  if (plaque.status === "paused")
    return fallback("This plaque is paused", "The business has turned this one off for now.");

  const { data: destination } = await supabaseAdmin
    .from("destinations")
    .select("destination_type, url")
    .eq("plaque_id", plaque.id)
    .is("effective_to", null)
    .eq("active", true)
    .maybeSingle();

  // Not set up yet: the tap itself proves the tag works, so send them into setup.
  if (!destination?.url) {
    return new Response(null, {
      status: 307,
      headers: { Location: `/setup/${slug}?source=${source}`, "Cache-Control": "no-store" },
    });
  }

  const occurredAt = new Date().toISOString();
  const key = visitorKey(request);

  // Fire-and-forget: never let logging delay the redirect.
  if (isTest) {
    void supabaseAdmin.from("events").insert([
      {
        business_id: plaque.business_id,
        plaque_id: plaque.id,
        event_type: "manufacturing_test",
        source_type: source,
        intent_type: destination.destination_type,
        occurred_at: occurredAt,
        metadata: { tl_test: true },
      },
    ]);
  } else {
    void supabaseAdmin.from("events").insert([
      {
        business_id: plaque.business_id,
        plaque_id: plaque.id,
        event_type: "interaction",
        source_type: source,
        intent_type: destination.destination_type,
        occurred_at: occurredAt,
        anonymous_visitor_key: key,
      },
      {
        business_id: plaque.business_id,
        plaque_id: plaque.id,
        event_type: "redirect_success",
        source_type: source,
        intent_type: destination.destination_type,
        occurred_at: occurredAt,
        anonymous_visitor_key: key,
      },
    ]);
  }

  return new Response(null, {
    status: 307,
    headers: { Location: destination.url, "Cache-Control": "no-store" },
  });
}

function visitorKey(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "";
  let hash = 0;
  for (const char of `${ua}|${ip}`) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `v_${Math.abs(hash).toString(36)}`;
}

function fallback(title: string, body: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0e1a;color:#f4f6fb;
font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;padding:24px}
.c{max-width:22rem;text-align:center}h1{font-size:20px;margin:0 0 8px}p{margin:0;font-size:14px;line-height:1.6;color:#9aa4bd}</style>
</head><body><div class="c"><h1>${title}</h1><p>${body}</p></div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
