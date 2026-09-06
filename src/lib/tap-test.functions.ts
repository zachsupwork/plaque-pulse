import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Server-side tap verification.
 *
 * Safari cannot read an NFC chip from a web page, so an iPhone admin proves a
 * plaque works the other way round: they tap it, the tag opens the TapLocal
 * managed link, and the server records the visit. This confirms the tap
 * reached the expected TapLocal URL — it never reads the chip's memory.
 */

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type TapEvent = {
  occurredAt: string;
  source: "nfc" | "qr" | null;
  device: string | null;
  test: boolean;
};

/** Everything the NFC plaque panel shows, in one call. */
export const getPlaqueNfcStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, status: null };

    const client = await db();
    const { data: plaque } = await client
      .from("plaques")
      .select("id, plaque_code, public_slug, status, business_id, location_id")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const, status: null };

    const [{ data: destination }, { data: programming }, { data: taps }] = await Promise.all([
      client
        .from("destinations")
        .select("destination_type, url")
        .eq("plaque_id", plaque.id)
        .is("effective_to", null)
        .eq("active", true)
        .maybeSingle(),
      client
        .from("plaque_programming")
        .select("write_status, verification_status, verified_at")
        .eq("plaque_id", plaque.id)
        .maybeSingle(),
      client
        .from("events")
        .select("occurred_at, source_type, device_family, event_type")
        .eq("plaque_id", plaque.id)
        .in("event_type", ["interaction", "manufacturing_test"])
        .order("occurred_at", { ascending: false })
        .limit(1),
    ]);

    const location = plaque.location_id
      ? (
          await client
            .from("locations")
            .select("google_review_url")
            .eq("id", plaque.location_id)
            .maybeSingle()
        ).data
      : null;

    const lastTap = taps?.[0]
      ? {
          occurredAt: taps[0].occurred_at,
          source: (taps[0].source_type as "nfc" | "qr" | null) ?? null,
          device: taps[0].device_family,
          test: taps[0].event_type === "manufacturing_test",
        }
      : null;

    return {
      ok: true as const,
      error: null,
      status: {
        plaqueId: plaque.id,
        plaqueCode: plaque.plaque_code,
        publicSlug: plaque.public_slug,
        /** The database switch an admin controls, on any device. */
        enabled: plaque.status !== "paused",
        plaqueStatus: plaque.status,
        writeStatus: programming?.write_status ?? null,
        verificationStatus: programming?.verification_status ?? null,
        destinationType: destination?.destination_type ?? null,
        destinationUrl: destination?.url ?? null,
        googleReviewUrl: location?.google_review_url ?? null,
        lastTap,
      },
    };
  });

/** Open a short verification window; the admin then taps the plaque. */
export const startTapTest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, startedAt: null, expiresAt: null };
    void data;
    const startedAt = new Date();
    return {
      ok: true as const,
      error: null,
      startedAt: startedAt.toISOString(),
      expiresAt: new Date(startedAt.getTime() + 60_000).toISOString(),
    };
  });

/** Has this plaque been tapped since the window opened? */
export const checkTapTest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ plaqueId: z.string().uuid(), since: z.string().min(10).max(40) }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, tap: null };

    const client = await db();
    const { data: rows } = await client
      .from("events")
      .select("occurred_at, source_type, device_family, event_type")
      .eq("plaque_id", data.plaqueId)
      .in("event_type", ["interaction", "manufacturing_test"])
      .gte("occurred_at", data.since)
      .order("occurred_at", { ascending: false })
      .limit(1);

    const row = rows?.[0];
    const tap: TapEvent | null = row
      ? {
          occurredAt: row.occurred_at,
          source: (row.source_type as "nfc" | "qr" | null) ?? null,
          device: row.device_family,
          test: row.event_type === "manufacturing_test",
        }
      : null;

    return { ok: true as const, error: null, tap };
  });

/** Enable or disable the plaque's live destination — a database switch, no hardware involved. */
export const setPlaqueEnabled = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ plaqueId: z.string().uuid(), enabled: z.boolean() }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };

    const client = await db();
    const { data: plaque } = await client
      .from("plaques")
      .select("id, business_id, status")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const };

    const next = data.enabled ? "active" : "paused";
    await client.from("plaques").update({ status: next }).eq("id", plaque.id);

    if (plaque.business_id) {
      await client.from("action_history").insert({
        business_id: plaque.business_id,
        plaque_id: plaque.id,
        action_type: data.enabled ? "plaque_enabled" : "plaque_disabled",
        previous_value: { status: plaque.status },
        new_value: { status: next },
        initiated_by: "admin",
        approved_by_user_id: caller.userId,
      });
    }

    return { ok: true as const, error: null };
  });
