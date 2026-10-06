import { createFileRoute } from "@tanstack/react-router";

/**
 * TapLocal "Share this business" link.
 * - A per-share token (minted when someone actually tapped Share) => CONFIRMED REFERRAL.
 * - The static business share code => only a "confirmed share-link visit".
 * Ordinary organic traffic never reaches this route.
 */
export const Route = createFileRoute("/r/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { anonVisitor, coarseDevice } = await import("@/lib/business-page.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: link } = await supabaseAdmin
          .from("referral_links")
          .select("id, token, business_id, plaque_id, tap_event_id, page_view_id, share_event_id, visit_count, first_visit_at")
          .eq("token", params.code)
          .maybeSingle();

        const businessId = link?.business_id ?? null;
        const { data: page } = businessId
          ? await supabaseAdmin.from("business_pages").select("business_id, share_code").eq("business_id", businessId).maybeSingle()
          : await supabaseAdmin.from("business_pages").select("business_id, share_code").eq("share_code", params.code).maybeSingle();
        if (!page) return new Response("Not found", { status: 404 });

        const { data: ev } = await supabaseAdmin.from("events").insert({
          event_type: "referral_visit",
          business_id: page.business_id,
          plaque_id: link?.plaque_id ?? null,
          device_family: coarseDevice(request),
          anonymous_visitor_key: anonVisitor(request),
          metadata: link
            ? {
                confirmed_referral: true,
                referral_token: link.token,
                share_event_id: link.share_event_id,
                tap_event_id: link.tap_event_id,
                page_view_id: link.page_view_id,
              }
            : { confirmed_referral: false, confirmed_share_link_visit: true, share_code: page.share_code },
        }).select("id").single();

        if (link) {
          await supabaseAdmin.from("referral_links").update({
            visit_count: link.visit_count + 1,
            first_visit_at: link.first_visit_at ?? new Date().toISOString(),
          }).eq("id", link.id);
        }

        const qs = ev?.id ? `?rv=${ev.id}` : "";
        return new Response(null, { status: 307, headers: { Location: `/p/${page.share_code}${qs}`, "Cache-Control": "no-store" } });
      },
    },
  },
});
