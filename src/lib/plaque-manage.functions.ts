import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nfcUrl, qrUrl } from "@/lib/smartlink";

/**
 * One shared management model for a single physical plaque.
 *
 * Every admin screen that shows a plaque uses `plaqueAdminSummary` so the same
 * facts (place, destination, placement, batch, programming, siblings) and the
 * same actions are available everywhere. The permanent public slug is never
 * touched by anything in this file.
 */

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type PlaqueSibling = {
  id: string;
  plaqueCode: string;
  placement: string | null;
  destinationType: string | null;
};

export type PlaqueAdminSummary = {
  plaqueId: string;
  plaqueCode: string;
  plaqueName: string | null;
  slug: string;
  nfcUrl: string;
  qrUrl: string;
  status: string;
  productType: string;
  style: string | null;
  batchId: string | null;
  writeStatus: string;
  verificationStatus: string;
  programmedAt: string | null;
  verifiedAt: string | null;
  assigned: boolean;
  businessId: string | null;
  businessName: string | null;
  locationId: string | null;
  locationName: string | null;
  address: string | null;
  placeKey: string | null;
  placement: string | null;
  destinationType: string | null;
  destinationUrl: string | null;
  siblings: PlaqueSibling[];
  siblingCount: number;
  taps30: number;
  tapsAllTime: number;
};

/** Everything any admin plaque surface needs, in one admin-verified call. */
export const plaqueAdminSummary = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, summary: null };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select(
        "id, plaque_code, plaque_name, public_slug, status, product_type, style, batch_id, business_id, location_id, placement_type",
      )
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const, summary: null };

    const [{ data: business }, { data: location }, { data: dest }, { data: prog }, { data: events }] = await Promise.all([
      plaque.business_id
        ? client.from("businesses").select("id, name").eq("id", plaque.business_id).maybeSingle()
        : Promise.resolve({ data: null }),
      plaque.location_id
        ? client.from("locations").select("id, name, address, city").eq("id", plaque.location_id).maybeSingle()
        : Promise.resolve({ data: null }),
      client
        .from("destinations")
        .select("destination_type, url")
        .eq("plaque_id", plaque.id)
        .is("effective_to", null)
        .maybeSingle(),
      client
        .from("plaque_programming")
        .select("write_status, verification_status, programmed_at, verified_at")
        .eq("plaque_id", plaque.id)
        .maybeSingle(),
      client.from("events").select("occurred_at").eq("plaque_id", plaque.id).limit(5000),
    ]);

    // Other plaques installed at the same place.
    let siblings: PlaqueSibling[] = [];
    let siblingCount = 0;
    if (plaque.business_id) {
      const query = client
        .from("plaques")
        .select("id, plaque_code, placement_type")
        .eq("business_id", plaque.business_id)
        .neq("id", plaque.id);
      const { data: others } = plaque.location_id ? await query.eq("location_id", plaque.location_id) : await query;
      const ids = (others ?? []).map((o) => o.id);
      const { data: dests } = ids.length
        ? await client.from("destinations").select("plaque_id, destination_type").in("plaque_id", ids).is("effective_to", null)
        : { data: [] };
      siblingCount = ids.length;
      siblings = (others ?? []).slice(0, 4).map((o) => ({
        id: o.id,
        plaqueCode: o.plaque_code,
        placement: o.placement_type,
        destinationType: (dests ?? []).find((d) => d.plaque_id === o.id)?.destination_type ?? null,
      }));
    }

    const cutoff = Date.now() - 30 * 86_400_000;
    const rows = events ?? [];

    const summary: PlaqueAdminSummary = {
      plaqueId: plaque.id,
      plaqueCode: plaque.plaque_code,
      plaqueName: plaque.plaque_name,
      slug: plaque.public_slug,
      nfcUrl: nfcUrl(plaque.public_slug),
      qrUrl: qrUrl(plaque.public_slug),
      status: plaque.status,
      productType: plaque.product_type,
      style: plaque.style,
      batchId: plaque.batch_id,
      writeStatus: prog?.write_status ?? "not_programmed",
      verificationStatus: prog?.verification_status ?? "unverified",
      programmedAt: prog?.programmed_at ?? null,
      verifiedAt: prog?.verified_at ?? null,
      assigned: Boolean(plaque.business_id),
      businessId: plaque.business_id,
      businessName: business?.name ?? null,
      locationId: plaque.location_id,
      locationName: location?.name ?? null,
      address: [location?.address, location?.city].filter(Boolean).join(", ") || null,
      placeKey: plaque.location_id ?? (plaque.business_id ? `b_${plaque.business_id}` : null),
      placement: plaque.placement_type,
      destinationType: dest?.destination_type ?? null,
      destinationUrl: dest?.url ?? null,
      siblings,
      siblingCount,
      taps30: rows.filter((e) => new Date(e.occurred_at).getTime() >= cutoff).length,
      tapsAllTime: rows.length,
    };

    return { ok: true as const, error: null, summary };
  });

const assignSchema = z.object({
  plaqueId: z.string().uuid(),
  businessId: z.string().uuid(),
  locationId: z.string().uuid().nullish(),
  placement: z.string().min(1).max(40),
  destinationType: z.string().min(1).max(40),
  destinationUrl: z.string().max(600).nullish(),
  plaqueName: z.string().max(80).nullish(),
});

/**
 * First assignment of a blank / inventory plaque, in one step.
 *
 * Cross-business moves are deliberately refused here: they must go through
 * `reassignPlaque`, which closes the old destination and placement safely.
 */
export const assignPlaqueToBusiness = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => assignSchema.parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, result: null };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, plaque_code, public_slug, business_id, status, plaque_name")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const, result: null };
    if (plaque.business_id && plaque.business_id !== data.businessId) {
      return { ok: false as const, error: "use_reassign" as const, result: null };
    }

    const { data: business } = await client.from("businesses").select("id, name").eq("id", data.businessId).maybeSingle();
    if (!business) return { ok: false as const, error: "business_not_found" as const, result: null };

    // The location must belong to this business.
    let locationId = data.locationId ?? null;
    if (locationId) {
      const { data: loc } = await client.from("locations").select("id, business_id").eq("id", locationId).maybeSingle();
      if (!loc || loc.business_id !== data.businessId) return { ok: false as const, error: "bad_location" as const, result: null };
    } else {
      const { data: first } = await client
        .from("locations")
        .select("id")
        .eq("business_id", data.businessId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      locationId = first?.id ?? null;
    }

    let url = data.destinationUrl?.trim() || "";
    if (!url && (data.destinationType === "google_review" || data.destinationType === "directions")) {
      if (data.destinationType === "google_review") {
        const { reviewDestinationForLocation } = await import("./google-link.server");
        url = (await reviewDestinationForLocation(client, locationId)).url ?? "";
      } else if (locationId) {
        const { data: loc } = await client
          .from("locations")
          .select("google_place_id, google_maps_uri")
          .eq("id", locationId)
          .maybeSingle();
        url =
          loc?.google_maps_uri ??
          (loc?.google_place_id
            ? `https://www.google.com/maps/search/?api=1&query=place&query_place_id=${encodeURIComponent(loc.google_place_id)}`
            : "");
      }
    }
    if (!url) return { ok: false as const, error: "no_destination" as const, result: null };

    const now = new Date().toISOString();

    const { error: moveError } = await client
      .from("plaques")
      .update({
        business_id: data.businessId,
        location_id: locationId,
        placement_type: data.placement,
        plaque_name: data.plaqueName || plaque.plaque_name,
        configured_at: now,
        ...(plaque.status === "inventory" || plaque.status === "packed" || plaque.status === "sold"
          ? { status: "configured_unclaimed" as const }
          : {}),
      })
      .eq("id", plaque.id);
    if (moveError) return { ok: false as const, error: "failed" as const, result: null };

    await client
      .from("destinations")
      .update({ effective_to: now, active: false })
      .eq("plaque_id", plaque.id)
      .is("effective_to", null);

    const { error: destError } = await client.from("destinations").insert({
      business_id: data.businessId,
      plaque_id: plaque.id,
      destination_type: data.destinationType as never,
      url,
      active: true,
      effective_from: now,
    });
    if (destError) return { ok: false as const, error: "failed" as const, result: null };

    await client
      .from("plaque_placement_history")
      .update({ effective_to: now })
      .eq("plaque_id", plaque.id)
      .is("effective_to", null);
    await client.from("plaque_placement_history").insert({
      plaque_id: plaque.id,
      location_id: locationId,
      placement_type: data.placement,
      placement_name: data.placement,
      effective_from: now,
      changed_by_user_id: caller.userId,
      reason: "Assigned from admin plaque management",
    });

    await client.from("action_history").insert({
      business_id: data.businessId,
      plaque_id: plaque.id,
      action_type: "plaque_assigned",
      previous_value: null,
      new_value: {
        plaque_code: plaque.plaque_code,
        slug: plaque.public_slug,
        business_id: data.businessId,
        business_name: business.name,
        location_id: locationId,
        placement: data.placement,
        destination: { type: data.destinationType, url },
        at: now,
      } as never,
      initiated_by: "admin",
      approved_by_user_id: caller.userId,
    });

    return {
      ok: true as const,
      error: null,
      result: {
        plaqueId: plaque.id,
        plaqueCode: plaque.plaque_code,
        slug: plaque.public_slug,
        businessId: data.businessId,
        businessName: business.name,
        locationId,
        placeKey: locationId ?? `b_${data.businessId}`,
        placement: data.placement,
        destinationType: data.destinationType,
        destinationUrl: url,
      },
    };
  });

/** Rename a plaque or change its lifecycle status without touching its links. */
export const updatePlaqueBasics = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        plaqueId: z.string().uuid(),
        plaqueName: z.string().max(80).nullish(),
        status: z
          .enum(["inventory", "packed", "sold", "configured_unclaimed", "claimed", "active", "paused", "faulty", "replaced", "retired"])
          .nullish(),
        batchId: z.string().max(40).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, business_id, status, plaque_name, batch_id")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const };

    const patch: Record<string, unknown> = {};
    if (data.plaqueName !== undefined && data.plaqueName !== null) patch["plaque_name"] = data.plaqueName || null;
    if (data.status) patch["status"] = data.status;
    if (data.batchId !== undefined && data.batchId !== null) patch["batch_id"] = data.batchId || null;
    if (Object.keys(patch).length === 0) return { ok: true as const, error: null };

    const { error } = await client.from("plaques").update(patch).eq("id", plaque.id);
    if (error) return { ok: false as const, error: "failed" as const };

    if (plaque.business_id) {
      await client.from("action_history").insert({
        business_id: plaque.business_id,
        plaque_id: plaque.id,
        action_type: "plaque_updated",
        previous_value: { status: plaque.status, plaque_name: plaque.plaque_name, batch_id: plaque.batch_id } as never,
        new_value: patch as never,
        initiated_by: "admin",
        approved_by_user_id: caller.userId,
      });
    }

    return { ok: true as const, error: null };
  });
