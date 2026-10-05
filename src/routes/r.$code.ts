import { createFileRoute } from "@tanstack/react-router";

/**
 * TapLocal "Share this business" link. Only visits through this generated URL are
 * labelled CONFIRMED REFERRAL — ordinary organic traffic never is.
 */
export const Route = createFileRoute("/r/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { anonVisitor, coarseDevice } = await import("@/lib/business-page.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: page } = await supabaseAdmin
          .from("business_pages").select("business_id, share_code").eq("share_code", params.code).maybeSingle();
        if (!page) return new Response("Not found", { status: 404 });
        const { data: ev } = await supabaseAdmin.from("events").insert({
          event_type: "referral_visit",
          business_id: page.business_id,
          device_family: coarseDevice(request),
          anonymous_visitor_key: anonVisitor(request),
          metadata: { confirmed_referral: true, share_code: page.share_code },
        }).select("id").single();
        const qs = ev?.id ? `?rv=${ev.id}` : "";
        return new Response(null, { status: 307, headers: { Location: `/p/${page.share_code}${qs}`, "Cache-Control": "no-store" } });
      },
    },
  },
});
