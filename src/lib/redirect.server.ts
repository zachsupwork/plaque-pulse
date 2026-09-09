import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type EventInsert = Database["public"]["Tables"]["events"]["Insert"];

/**
 * Persist one event before redirecting. Analytics correctness beats a few
 * milliseconds of latency, so this is awaited, never fire-and-forget.
 *
 * The canonical customer interaction is written on its own, never batched with
 * telemetry: a telemetry failure must never take the interaction down with it.
 * A logging failure is recorded loudly server-side but never blocks the visitor.
 */
async function logEvent(row: EventInsert, context: { slug: string; source: string }) {
  try {
    const { error } = await supabaseAdmin.from("events").insert(row);
    if (error) {
      console.error(
        `[TapLocal] ${row.event_type === "interaction" ? "TAPLOCAL INTERACTION SAVE FAILED" : "EVENT LOGGING FAILED"}` +
          ` event=${row.event_type} plaque=${row.plaque_id ?? "unknown"} slug=${context.slug}` +
          ` source=${context.source} at=${new Date().toISOString()} code=${error.code ?? "none"} reason=${error.message}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `[TapLocal] ${row.event_type === "interaction" ? "TAPLOCAL INTERACTION SAVE FAILED" : "EVENT LOGGING FAILED"}` +
        ` event=${row.event_type} plaque=${row.plaque_id ?? "unknown"} slug=${context.slug}` +
        ` source=${context.source} at=${new Date().toISOString()}`,
      err,
    );
    return false;
  }
}


/** Resolve a public plaque slug to its live destination and record the interaction. */
export async function resolveAndRedirect(slug: string, source: "nfc" | "qr", request: Request) {
  // Manufacturing and support taps carry tl_test=1 and must never touch customer numbers.
  const isTest = new URL(request.url).searchParams.get("tl_test") === "1";

  const { data: plaque } = await supabaseAdmin
    .from("plaques")
    .select("id, business_id, location_id, status")
    .eq("public_slug", slug)
    .maybeSingle();

  if (!plaque) return fallback("We couldn't find this plaque", "Check the code on the plaque and try again.");

  const device = deviceFamily(request);
  const key = visitorKey(request);
  const occurredAt = new Date().toISOString();

  const base = {
    business_id: plaque.business_id,
    plaque_id: plaque.id,
    location_id: plaque.location_id,
    source_type: source,
    device_family: device,
    occurred_at: occurredAt,
  } satisfies Partial<EventInsert>;

  // Disabled by an admin: the tag itself still works, so record the tap as an
  // operational inactive_tap (never a manufacturing test) and show the inactive page.
  if (plaque.status === "paused") {
    await logEvents([
      {
        ...base,
        event_type: isTest ? "manufacturing_test" : "inactive_tap",
        anonymous_visitor_key: isTest ? null : key,
        metadata: { inactive: true, ...(isTest ? { tl_test: true } : {}) },
      },
    ]);
    return fallback(
      "This TapLocal plaque is currently inactive.",
      "The tag is working — its destination has been turned off. Contact TapLocal to switch it back on.",
    );
  }

  const { data: destination } = await supabaseAdmin
    .from("destinations")
    .select("id, destination_type, url")
    .eq("plaque_id", plaque.id)
    .is("effective_to", null)
    .eq("active", true)
    .maybeSingle();

  // Not set up yet: the tap itself proves the tag works, so record it for
  // troubleshooting (never as a customer interaction) and send them into setup.
  if (!destination?.url) {
    await logEvents([
      {
        ...base,
        event_type: isTest ? "manufacturing_test" : "setup_open",
        metadata: { unconfigured: true, ...(isTest ? { tl_test: true } : {}) },
      },
    ]);
    return new Response(null, {
      status: 307,
      headers: { Location: `/setup/${slug}?source=${source}`, "Cache-Control": "no-store" },
    });
  }

  const shared = {
    ...base,
    intent_type: intentFor(destination.destination_type),
    destination_type: destination.destination_type,
    destination_id: destination.id,
  };

  if (isTest) {
    // Testing/debugging only — excluded from every customer analytics counter.
    await logEvents([{ ...shared, event_type: "manufacturing_test", metadata: { tl_test: true } }]);
  } else {
    // Exactly one canonical customer interaction, plus operational redirect telemetry.
    // Analytics counts only event_type = 'interaction'.
    await logEvents([
      { ...shared, event_type: "interaction", anonymous_visitor_key: key, metadata: {} },
      { ...shared, event_type: "redirect_success", anonymous_visitor_key: key, metadata: { telemetry: true } },
    ]);
  }

  return new Response(null, {
    status: 307,
    headers: { Location: destination.url, "Cache-Control": "no-store" },
  });
}

type IntentType = NonNullable<EventInsert["intent_type"]>;
type DestinationType = NonNullable<EventInsert["destination_type"]>;

const INTENT_BY_DESTINATION: Record<DestinationType, IntentType> = {
  google_review: "review",
  instagram: "social",
  facebook: "social",
  website: "website",
  menu: "menu",
  booking: "booking",
  directions: "directions",
  call: "lead",
  quote: "lead",
  coupon: "promotion",
  loyalty: "loyalty",
  custom: "custom",
};

function intentFor(destinationType: DestinationType): IntentType {
  return INTENT_BY_DESTINATION[destinationType] ?? "custom";
}

/** Coarse device family only — never a fingerprint. */
function deviceFamily(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh|Windows|X11|Linux/i.test(ua)) return "Desktop";
  return "Other";
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
