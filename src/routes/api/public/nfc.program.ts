import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sameSmartLink } from "@/lib/smartlink";
import { hashToken } from "@/lib/nfc-program.functions";

/**
 * Native bridge for the TapLocal iOS NFC companion (Apple Core NFC).
 *
 * The programming token IS the authorization, and it authorizes exactly one
 * thing: writing one plaque's TapLocal SmartLink. The native app never sends
 * the URL to write — it asks for it. No Supabase token, admin role or customer
 * destination ever crosses this boundary.
 */

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("redeem"), token: z.string().min(20).max(200) }),
  z.object({
    action: z.literal("report"),
    token: z.string().min(20).max(200),
    status: z.enum(["writing", "written", "verified", "failed"]),
    writtenValue: z.string().max(500).optional(),
    errorCode: z.string().max(60).optional(),
  }),
]);

export const Route = createFileRoute("/api/public/nfc/program")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let input: z.infer<typeof body>;
        try {
          input = body.parse(await request.json());
        } catch {
          return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const tokenHash = await hashToken(input.token);

        const { data: session } = await supabaseAdmin
          .from("nfc_programming_sessions")
          .select("id, plaque_id, expected_url, status, expires_at, requested_by_user_id")
          .eq("token_hash", tokenHash)
          .maybeSingle();

        if (!session) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
        if (new Date(session.expires_at).getTime() < Date.now()) {
          await supabaseAdmin.from("nfc_programming_sessions").update({ status: "expired" }).eq("id", session.id);
          return Response.json({ ok: false, error: "session_expired" }, { status: 410 });
        }
        if (session.status === "verified") {
          return Response.json({ ok: false, error: "already_used" }, { status: 409 });
        }

        const { data: plaque } = await supabaseAdmin
          .from("plaques")
          .select("id, plaque_code, business_id")
          .eq("id", session.plaque_id)
          .maybeSingle();

        if (input.action === "redeem") {
          await supabaseAdmin
            .from("nfc_programming_sessions")
            .update({ status: "opened", opened_at: new Date().toISOString() })
            .eq("id", session.id);
          let businessName: string | null = null;
          if (plaque?.business_id) {
            businessName = (
              await supabaseAdmin.from("businesses").select("name").eq("id", plaque.business_id).maybeSingle()
            ).data?.name ?? null;
          }
          return Response.json({
            ok: true,
            sessionId: session.id,
            plaqueCode: plaque?.plaque_code ?? null,
            businessName,
            // The one value that may be written to the tag.
            expectedUrl: session.expected_url,
            expiresAt: session.expires_at,
          });
        }

        // ---- report ----
        const now = new Date().toISOString();
        if (input.status === "writing") {
          await supabaseAdmin.from("nfc_programming_sessions").update({ status: "writing" }).eq("id", session.id);
          return Response.json({ ok: true, status: "writing" });
        }

        if (input.status === "failed") {
          await supabaseAdmin
            .from("nfc_programming_sessions")
            .update({ status: "failed", error_code: input.errorCode ?? "unknown", used_at: now })
            .eq("id", session.id);
          await supabaseAdmin.from("programming_events").insert({
            plaque_id: session.plaque_id,
            event_type: "write",
            expected_value: session.expected_url,
            result: "failed",
            user_id: session.requested_by_user_id,
            device_info: { programming_method: "ios_core_nfc", error_code: input.errorCode ?? "unknown" },
          });
          return Response.json({ ok: true, status: "failed" });
        }

        // written / verified — the server decides whether it counts as verified.
        const matches = input.writtenValue ? sameSmartLink(input.writtenValue, session.expected_url) : false;
        const verified = input.status === "verified" && matches;
        const finalStatus = verified ? "verified" : matches || input.status === "written" ? "written" : "failed";

        await supabaseAdmin
          .from("nfc_programming_sessions")
          .update({
            status: finalStatus,
            used_at: now,
            verified_at: verified ? now : null,
            error_code: finalStatus === "failed" ? "mismatch" : null,
          })
          .eq("id", session.id);

        const { data: existing } = await supabaseAdmin
          .from("plaque_programming")
          .select("id")
          .eq("plaque_id", session.plaque_id)
          .maybeSingle();

        const patch = {
          expected_nfc_url: session.expected_url,
          write_status: finalStatus === "failed" ? "failed" : "written",
          verification_status: verified ? "verified" : "unverified",
          programmed_at: now,
          verified_at: verified ? now : null,
          programmed_by_user_id: session.requested_by_user_id,
          verified_by_user_id: verified ? session.requested_by_user_id : null,
          device_info: { method: "ios_core_nfc" },
        };
        if (existing) await supabaseAdmin.from("plaque_programming").update(patch).eq("id", existing.id);
        else await supabaseAdmin.from("plaque_programming").insert({ plaque_id: session.plaque_id, ...patch });

        await supabaseAdmin.from("programming_events").insert({
          plaque_id: session.plaque_id,
          event_type: verified ? "verify" : "write",
          expected_value: session.expected_url,
          actual_value: input.writtenValue ?? null,
          result: verified ? "verified" : finalStatus,
          user_id: session.requested_by_user_id,
          device_info: { programming_method: "ios_core_nfc" },
        });

        return Response.json({
          ok: true,
          status: finalStatus,
          verified,
          returnUrl: `${new URL(request.url).origin}/nfc/return/${session.id}`,
        });
      },
    },
  },
});
