import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nfcUrl, sameSmartLink } from "@/lib/smartlink";
import type { Json } from "@/integrations/supabase/types";

/** Owner-facing NFC management. Everything is scoped to one business the caller can manage. */

const PLAQUE_COLUMNS =
  "id, plaque_code, public_slug, plaque_name, placement_type, product_type, status, activated_at, business_id, location_id, batch_id";

const deviceInfo = z.record(z.string(), z.unknown()).optional();

async function access(businessId: string) {
  const { requireBusinessAccess } = await import("@/lib/business-auth.server");
  return requireBusinessAccess(businessId);
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function ensureRow(
  client: Awaited<ReturnType<typeof db>>,
  plaqueId: string,
  slug: string,
  batchId: string | null,
) {
  const { data: existing } = await client
    .from("plaque_programming")
    .select("id")
    .eq("plaque_id", plaqueId)
    .maybeSingle();
  if (existing) return;
  await client
    .from("plaque_programming")
    .insert({ plaque_id: plaqueId, batch_id: batchId, expected_nfc_url: nfcUrl(slug) });
}

/** Confirms a plaque really belongs to the business before any write. */
async function ownedPlaque(client: Awaited<ReturnType<typeof db>>, businessId: string, plaqueId: string) {
  const { data } = await client
    .from("plaques")
    .select("id, public_slug, batch_id, business_id, location_id, plaque_name, placement_type")
    .eq("id", plaqueId)
    .eq("business_id", businessId)
    .maybeSingle();
  return data;
}

/** Every tag the business owns, with its programming state, place and current destination. */
export const listBusinessTags = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ businessId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await access(data.businessId);
    if (!caller.ok) return { ok: false as const, error: caller.error, tags: [], locations: [] };
    const client = await db();

    const { data: plaques } = await client
      .from("plaques")
      .select(PLAQUE_COLUMNS)
      .eq("business_id", data.businessId)
      .order("created_at", { ascending: true });

    const ids = (plaques ?? []).map((p) => p.id);
    const safeIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];

    const { data: programming } = await client
      .from("plaque_programming")
      .select("plaque_id, write_status, verification_status, programmed_at, verified_at, notes")
      .in("plaque_id", safeIds);
    const { data: destinations } = await client
      .from("destinations")
      .select("plaque_id, destination_type, url, active, effective_to")
      .eq("business_id", data.businessId)
      .is("effective_to", null)
      .eq("active", true);
    const { data: locations } = await client
      .from("locations")
      .select("id, name, city, active")
      .eq("business_id", data.businessId)
      .order("name", { ascending: true });

    const byPlaque = new Map((programming ?? []).map((r) => [r.plaque_id, r]));
    const destByPlaque = new Map((destinations ?? []).map((d) => [d.plaque_id, d]));

    return {
      ok: true as const,
      locations: locations ?? [],
      tags: (plaques ?? []).map((p) => ({
        plaque: p,
        writeStatus: byPlaque.get(p.id)?.write_status ?? "not_programmed",
        verificationStatus: byPlaque.get(p.id)?.verification_status ?? "not_verified",
        programmedAt: byPlaque.get(p.id)?.programmed_at ?? null,
        verifiedAt: byPlaque.get(p.id)?.verified_at ?? null,
        destination: destByPlaque.get(p.id) ?? null,
      })),
    };
  });

/** One tag in full detail. */
export const getBusinessTag = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ businessId: z.string().uuid(), plaqueId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await access(data.businessId);
    if (!caller.ok) return { ok: false as const, error: caller.error, tag: null };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select(PLAQUE_COLUMNS)
      .eq("id", data.plaqueId)
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (!plaque) return { ok: true as const, tag: null };

    const { data: programming } = await client
      .from("plaque_programming")
      .select("write_status, verification_status, programmed_at, verified_at, notes")
      .eq("plaque_id", plaque.id)
      .maybeSingle();
    const { data: destination } = await client
      .from("destinations")
      .select("destination_type, url, effective_from")
      .eq("plaque_id", plaque.id)
      .is("effective_to", null)
      .eq("active", true)
      .maybeSingle();
    const { data: location } = plaque.location_id
      ? await client.from("locations").select("id, name, city").eq("id", plaque.location_id).maybeSingle()
      : { data: null };

    return {
      ok: true as const,
      tag: {
        plaque,
        writeStatus: programming?.write_status ?? "not_programmed",
        verificationStatus: programming?.verification_status ?? "not_verified",
        programmedAt: programming?.programmed_at ?? null,
        verifiedAt: programming?.verified_at ?? null,
        notes: programming?.notes ?? null,
        destination: destination ?? null,
        location: location ?? null,
      },
    };
  });

/** Identify a tag the owner just read, by its SmartLink slug. */
export const lookupBySlug = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ businessId: z.string().uuid(), slug: z.string().min(1).max(40) }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await access(data.businessId);
    if (!caller.ok) return { ok: false as const, error: caller.error, plaque: null, belongsToBusiness: false };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select(PLAQUE_COLUMNS)
      .eq("public_slug", data.slug)
      .maybeSingle();
    if (!plaque) return { ok: true as const, plaque: null, belongsToBusiness: false };

    const belongs = plaque.business_id === data.businessId;
    // Never leak another business's tag details.
    return {
      ok: true as const,
      belongsToBusiness: belongs,
      plaque: belongs ? plaque : null,
    };
  });

/** Records the result of an owner write attempt. */
export const recordTagWrite = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        plaqueId: z.string().uuid(),
        status: z.enum(["not_programmed", "programming", "programmed", "failed"]),
        manual: z.boolean().optional(),
        notes: z.string().max(500).optional(),
        deviceInfo,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await access(data.businessId);
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();
    const plaque = await ownedPlaque(client, data.businessId, data.plaqueId);
    if (!plaque) return { ok: false as const, error: "not_found" as const };

    await ensureRow(client, plaque.id, plaque.public_slug, plaque.batch_id);
    const programmed = data.status === "programmed";
    await client
      .from("plaque_programming")
      .update({
        write_status: data.status,
        expected_nfc_url: nfcUrl(plaque.public_slug),
        programmed_at: programmed ? new Date().toISOString() : null,
        programmed_by_user_id: programmed ? caller.userId : null,
        ...(programmed && data.manual ? { verification_status: "not_verified" } : {}),
        ...(data.notes ? { notes: data.notes } : {}),
        device_info: (data.deviceInfo ?? {}) as unknown as Json,
      })
      .eq("plaque_id", plaque.id);

    await client.from("programming_events").insert({
      plaque_id: plaque.id,
      event_type: data.manual ? "manual_programming_confirmed" : `write_${data.status}`,
      expected_value: nfcUrl(plaque.public_slug),
      result: data.manual ? "manual" : data.status,
      user_id: caller.userId,
      device_info: (data.deviceInfo ?? {}) as unknown as Json,
    });

    return { ok: true as const };
  });

/** Read-back verification. A mismatch is always surfaced, never quietly accepted. */
export const recordTagVerification = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        plaqueId: z.string().uuid(),
        actualUrl: z.string().max(500),
        deviceInfo,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await access(data.businessId);
    if (!caller.ok) return { ok: false as const, error: caller.error, matched: false, expected: "" };
    const client = await db();
    const plaque = await ownedPlaque(client, data.businessId, data.plaqueId);
    if (!plaque) return { ok: false as const, error: "not_found" as const, matched: false, expected: "" };

    const expected = nfcUrl(plaque.public_slug);
    // Host-agnostic: a tag written before the short domain went live is still correct.
    const matched = sameSmartLink(data.actualUrl.trim(), expected);
    await ensureRow(client, plaque.id, plaque.public_slug, plaque.batch_id);

    await client
      .from("plaque_programming")
      .update({
        verification_status: matched ? "verified" : "mismatch",
        verified_at: matched ? new Date().toISOString() : null,
        verified_by_user_id: matched ? caller.userId : null,
      })
      .eq("plaque_id", plaque.id);

    await client.from("programming_events").insert({
      plaque_id: plaque.id,
      event_type: matched ? "verification_match" : "verification_mismatch",
      expected_value: expected,
      actual_value: data.actualUrl,
      result: matched ? "match" : "mismatch",
      user_id: caller.userId,
      device_info: (data.deviceInfo ?? {}) as unknown as Json,
    });

    return { ok: true as const, matched, expected };
  });

const DESTINATION_TYPES = [
  "google_review",
  "instagram",
  "facebook",
  "website",
  "menu",
  "booking",
  "directions",
  "call",
  "quote",
  "coupon",
  "loyalty",
  "custom",
] as const;

/**
 * Names a tag, places it, and optionally points it somewhere new.
 * A destination change closes the previous row and opens a new one — history is never overwritten.
 */
export const setUpTag = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        plaqueId: z.string().uuid(),
        plaqueName: z.string().max(80).optional(),
        placementType: z.string().max(40).optional(),
        locationId: z.string().uuid().nullable().optional(),
        destinationType: z.enum(DESTINATION_TYPES).optional(),
        url: z.string().url().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await access(data.businessId);
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();
    const plaque = await ownedPlaque(client, data.businessId, data.plaqueId);
    if (!plaque) return { ok: false as const, error: "not_found" as const };

    const patch: { plaque_name?: string; placement_type?: string; location_id?: string | null } = {};
    if (data.plaqueName !== undefined) patch.plaque_name = data.plaqueName;
    if (data.placementType !== undefined) patch.placement_type = data.placementType;
    if (data.locationId !== undefined) patch.location_id = data.locationId;
    if (Object.keys(patch).length) await client.from("plaques").update(patch).eq("id", plaque.id);

    if (data.locationId !== undefined && data.locationId !== plaque.location_id) {
      await client
        .from("plaque_placement_history")
        .update({ effective_to: new Date().toISOString() })
        .eq("plaque_id", plaque.id)
        .is("effective_to", null);
      await client.from("plaque_placement_history").insert({
        plaque_id: plaque.id,
        location_id: data.locationId,
        placement_type: data.placementType ?? plaque.placement_type,
        placement_name: data.plaqueName ?? plaque.plaque_name,
        changed_by_user_id: caller.userId,
        reason: "Owner set up NFC tag",
      });
    }

    if (data.destinationType && data.url) {
      await client
        .from("destinations")
        .update({ active: false, effective_to: new Date().toISOString() })
        .eq("plaque_id", plaque.id)
        .is("effective_to", null);
      await client.from("destinations").insert({
        business_id: data.businessId,
        plaque_id: plaque.id,
        destination_type: data.destinationType,
        url: data.url,
        active: true,
      });
      await client.from("action_history").insert({
        business_id: data.businessId,
        plaque_id: plaque.id,
        action_type: "destination_changed",
        new_value: { destination_type: data.destinationType, url: data.url } as unknown as Json,
        initiated_by: "owner",
        approved_by_user_id: caller.userId,
      });
    }

    return { ok: true as const };
  });

/** Retires a damaged tag and carries its destination over to a replacement tag. */
export const replaceTag = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        oldPlaqueId: z.string().uuid(),
        newPlaqueId: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await access(data.businessId);
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();
    const oldPlaque = await ownedPlaque(client, data.businessId, data.oldPlaqueId);
    const newPlaque = await ownedPlaque(client, data.businessId, data.newPlaqueId);
    if (!oldPlaque || !newPlaque) return { ok: false as const, error: "not_found" as const };

    const { data: current } = await client
      .from("destinations")
      .select("destination_type, url")
      .eq("plaque_id", oldPlaque.id)
      .is("effective_to", null)
      .eq("active", true)
      .maybeSingle();

    await client
      .from("destinations")
      .update({ active: false, effective_to: new Date().toISOString() })
      .eq("plaque_id", oldPlaque.id)
      .is("effective_to", null);

    if (current) {
      await client
        .from("destinations")
        .update({ active: false, effective_to: new Date().toISOString() })
        .eq("plaque_id", newPlaque.id)
        .is("effective_to", null);
      await client.from("destinations").insert({
        business_id: data.businessId,
        plaque_id: newPlaque.id,
        destination_type: current.destination_type,
        url: current.url,
        active: true,
      });
    }

    await client
      .from("plaques")
      .update({
        plaque_name: oldPlaque.plaque_name,
        placement_type: oldPlaque.placement_type,
        location_id: oldPlaque.location_id,
        status: "active",
      })
      .eq("id", newPlaque.id);
    await client.from("plaques").update({ status: "replaced" }).eq("id", oldPlaque.id);

    await client.from("action_history").insert({
      business_id: data.businessId,
      plaque_id: newPlaque.id,
      action_type: "tag_replaced",
      previous_value: { plaque_id: oldPlaque.id } as unknown as Json,
      new_value: { plaque_id: newPlaque.id } as unknown as Json,
      initiated_by: "owner",
      approved_by_user_id: caller.userId,
    });

    return { ok: true as const };
  });
