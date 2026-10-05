import { createFileRoute } from "@tanstack/react-router";

/** TapLocal Page button click: record it, then send the visitor on. */
export const Route = createFileRoute("/go/$key/$buttonId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { resolvePageKey, anonVisitor, coarseDevice, buttonDestinationType } = await import("@/lib/business-page.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const found = await resolvePageKey(params.key);
        type Btn = { id: string; kind: Parameters<typeof buttonDestinationType>[0]; url: string; enabled: boolean };
        const button = (found?.page.buttons as Btn[] | undefined)?.find((b) => b.id === params.buttonId && b.enabled);
        if (!found || !button) return new Response(null, { status: 307, headers: { Location: `/p/${params.key}` } });

        const q = new URL(request.url).searchParams;
        const uuid = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
        const src = q.get("src");
        const test = q.get("tl_test") === "1";
        try {
          await supabaseAdmin.from("events").insert({
            event_type: test ? "manufacturing_test" : "link_click",
            business_id: found.page.business_id,
            plaque_id: found.plaque?.id ?? null,
            location_id: found.plaque?.location_id ?? null,
            source_type: src === "nfc" || src === "qr" ? src : null,
            destination_type: buttonDestinationType(button.kind),
            device_family: coarseDevice(request),
            anonymous_visitor_key: test ? null : anonVisitor(request),
            metadata: {
              button_id: button.id,
              button_kind: button.kind,
              tap_event_id: uuid(q.get("t")),
              page_view_id: uuid(q.get("v")),
              referral_event_id: uuid(q.get("rv")),
              confirmed_referral: Boolean(uuid(q.get("rv"))),
              ...(test ? { tl_test: true } : {}),
            },
          });
        } catch (err) {
          console.error("[TapLocal] PAGE CLICK LOGGING FAILED", err);
        }
        return new Response(null, { status: 307, headers: { Location: button.url, "Cache-Control": "no-store" } });
      },
    },
  },
});
