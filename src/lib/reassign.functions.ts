import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nfcUrl, qrUrl } from "@/lib/smartlink";

/**
 * Safe field reassignment of an already-printed / already-programmed plaque.
 *
 * The permanent public slug NEVER changes: the printed QR (/q/[slug]) and the
 * programmed NFC tag (/n/[slug]) keep working. Only the business, location,
 * placement and destination move. Historical events stay attached to the
 * business that earned them.
 */

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type ReassignContext = {
  plaqueId: string;
  plaqueCode: string;
  slug: string;
  plaqueName: string | null;
  status: string;
  productType: string;
  style: string | null;
  batchId: string | null;
  batchPosition: number | null;
  nfcUrl: string;
  qrUrl: string;
  writeStatus: string;
  verificationStatus: string;
  nfcRewriteRequired: boolean;
  currentBusinessId: string | null;
  currentBusinessName: string | null;
  currentLocationId: string | null;
  currentLocationName: string | null;
  currentAddress: string | null;
  currentPlacement: string | null;
  currentDestinationType: string | null;
  currentDestinationUrl: string | null;
  /** Old business has owner/customer accounts — needs a stronger confirmation. */
  customerManaged: boolean;
  ownerCount: number;
  designReusable: boolean;
  designNote: string;
  /** Lifetime hardware history: which business earned which interactions. */
  history: { businessId: string | null; businessName: string; interactions: number; first: string | null; last: string | null }[];
};

/** Everything the reassign screen needs about the physical plaque as it stands today. */
export const reassignContext = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, context: null };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select(
        "id, plaque_code, public_slug, plaque_name, status, product_type, style, batch_id, business_id, location_id, placement_type",
      )
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const, context: null };

    const [{ data: business }, { data: location }, { data: dest }, { data: prog }, { data: prints }, { data: events }] =
      await Promise.all([
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
          .select("write_status, verification_status, expected_nfc_url, batch_id")
          .eq("plaque_id", plaque.id)
          .maybeSingle(),
        client
          .from("qr_print_records")
          .select("design_name, print_position, batch_id, printed_at")
          .eq("plaque_id", plaque.id)
          .order("printed_at", { ascending: false })
          .limit(5),
        client.from("events").select("business_id, occurred_at").eq("plaque_id", plaque.id).limit(5000),
      ]);

    const owners = plaque.business_id
      ? await client.from("business_members").select("id", { count: "exact", head: true }).eq("business_id", plaque.business_id)
      : { count: 0 };
    const ownerCount = owners.count ?? 0;

    // Group historical interactions by the business that owned the plaque at the time.
    const byBusiness = new Map<string | null, { count: number; first: string | null; last: string | null }>();
    for (const e of events ?? []) {
      const key = e.business_id;
      const row = byBusiness.get(key) ?? { count: 0, first: null, last: null };
      row.count += 1;
      if (!row.first || e.occurred_at < row.first) row.first = e.occurred_at;
      if (!row.last || e.occurred_at > row.last) row.last = e.occurred_at;
      byBusiness.set(key, row);
    }
    const otherIds = [...byBusiness.keys()].filter((id): id is string => Boolean(id));
    const { data: names } = otherIds.length
      ? await client.from("businesses").select("id, name").in("id", otherIds)
      : { data: [] };

    const history = [...byBusiness.entries()]
      .map(([businessId, row]) => ({
        businessId,
        businessName: (names ?? []).find((n) => n.id === businessId)?.name ?? "Unassigned",
        interactions: row.count,
        first: row.first,
        last: row.last,
      }))
      .sort((a, b) => (a.first ?? "").localeCompare(b.first ?? ""));

    const latestPrint = (prints ?? [])[0] ?? null;
    const brandedProduct = plaque.product_type === "instagram_plaque" || plaque.product_type === "custom";
    const brandedArtwork = Boolean(
      business?.name && latestPrint?.design_name && latestPrint.design_name.toLowerCase().includes(business.name.toLowerCase()),
    );
    const designReusable = !brandedProduct && !brandedArtwork;

    const expected = nfcUrl(plaque.public_slug);
    const nfcRewriteRequired = Boolean(prog?.expected_nfc_url && prog.expected_nfc_url !== expected);

    const context: ReassignContext = {
      plaqueId: plaque.id,
      plaqueCode: plaque.plaque_code,
      slug: plaque.public_slug,
      plaqueName: plaque.plaque_name,
      status: plaque.status,
      productType: plaque.product_type,
      style: plaque.style,
      batchId: plaque.batch_id ?? prog?.batch_id ?? null,
      batchPosition: latestPrint?.print_position ?? null,
      nfcUrl: expected,
      qrUrl: qrUrl(plaque.public_slug),
      writeStatus: prog?.write_status ?? "not_programmed",
      verificationStatus: prog?.verification_status ?? "unverified",
      nfcRewriteRequired,
      currentBusinessId: plaque.business_id,
      currentBusinessName: business?.name ?? null,
      currentLocationId: plaque.location_id,
      currentLocationName: location?.name ?? null,
      currentAddress: [location?.address, location?.city].filter(Boolean).join(", ") || null,
      currentPlacement: plaque.placement_type,
      currentDestinationType: dest?.destination_type ?? null,
      currentDestinationUrl: dest?.url ?? null,
      customerManaged: ownerCount > 0,
      ownerCount,
      designReusable,
      designNote: designReusable
        ? "Generic artwork — the printed design can move to the new business."
        : brandedArtwork
          ? `The printed artwork references ${business?.name}. The QR and NFC still work, but the branded panel needs a reprint.`
          : "This product carries business-specific branding, so the printed panel needs a reprint even though the QR and NFC stay valid.",
      history,
    };

    return { ok: true as const, error: null, context };
  });

const reassignSchema = z.object({
  plaqueId: z.string().uuid(),
  newBusinessId: z.string().uuid(),
  newLocationId: z.string().uuid().nullish(),
  newPlacement: z.string().min(1).max(40),
  newDestinationType: z.string().min(1).max(40),
  /** Omitted for derived destinations (Google Reviews, Directions). */
  newDestinationUrl: z.string().max(600).nullish(),
  keepBatch: z.boolean().default(true),
});

/**
 * Move a physical plaque to a different business as one complete operation.
 *
 * Keeps: plaque id, plaque code, public slug, NFC link, QR link, NFC programming
 * verification, batch, all historical events and all historical destination and
 * placement rows. Never carries the old business's location forward.
 */
export const reassignPlaque = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => reassignSchema.parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, result: null };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, plaque_code, public_slug, business_id, location_id, placement_type, batch_id, status")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const, result: null };

    if (plaque.business_id === data.newBusinessId && !data.newLocationId) {
      return { ok: false as const, error: "same_business" as const, result: null };
    }

    const { data: newBusiness } = await client
      .from("businesses")
      .select("id, name")
      .eq("id", data.newBusinessId)
      .maybeSingle();
    if (!newBusiness) return { ok: false as const, error: "business_not_found" as const, result: null };

    // The new location must belong to the NEW business — never inherit the old one.
    let locationId = data.newLocationId ?? null;
    if (locationId) {
      const { data: loc } = await client
        .from("locations")
        .select("id, business_id")
        .eq("id", locationId)
        .maybeSingle();
      if (!loc || loc.business_id !== data.newBusinessId) return { ok: false as const, error: "bad_location" as const, result: null };
    } else {
      const { data: firstLocation } = await client
        .from("locations")
        .select("id")
        .eq("business_id", data.newBusinessId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      locationId = firstLocation?.id ?? null;
    }

    // Resolve derived destinations against the NEW business's listing.
    let url = data.newDestinationUrl?.trim() || "";
    if (!url && (data.newDestinationType === "google_review" || data.newDestinationType === "directions")) {
      if (data.newDestinationType === "google_review") {
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

    const { data: oldDestination } = await client
      .from("destinations")
      .select("id, destination_type, url")
      .eq("plaque_id", plaque.id)
      .is("effective_to", null)
      .maybeSingle();

    // 1. Close the old destination so it can never serve the new business.
    if (oldDestination) {
      const { error } = await client
        .from("destinations")
        .update({ effective_to: now, active: false })
        .eq("id", oldDestination.id);
      if (error) return { ok: false as const, error: "failed" as const, result: null };
    }
    await client
      .from("destinations")
      .update({ effective_to: now, active: false })
      .eq("plaque_id", plaque.id)
      .is("effective_to", null);

    // 2. Close the old placement history.
    await client
      .from("plaque_placement_history")
      .update({ effective_to: now })
      .eq("plaque_id", plaque.id)
      .is("effective_to", null);

    // 3. Move the plaque itself. Slug, code and id are untouched by design.
    const { error: moveError } = await client
      .from("plaques")
      .update({
        business_id: data.newBusinessId,
        location_id: locationId,
        placement_type: data.newPlacement,
        configured_at: now,
        ...(data.keepBatch ? {} : { batch_id: null }),
      })
      .eq("id", plaque.id);
    if (moveError) {
      // Reopen the destination we just closed rather than leave a dark plaque.
      if (oldDestination) await client.from("destinations").update({ effective_to: null, active: true }).eq("id", oldDestination.id);
      return { ok: false as const, error: "failed" as const, result: null };
    }

    // 4. Open the new destination for the new business.
    const { error: destError } = await client.from("destinations").insert({
      business_id: data.newBusinessId,
      plaque_id: plaque.id,
      destination_type: data.newDestinationType as never,
      url,
      active: true,
      effective_from: now,
    });
    if (destError) {
      await client
        .from("plaques")
        .update({
          business_id: plaque.business_id,
          location_id: plaque.location_id,
          placement_type: plaque.placement_type,
        })
        .eq("id", plaque.id);
      if (oldDestination) await client.from("destinations").update({ effective_to: null, active: true }).eq("id", oldDestination.id);
      return { ok: false as const, error: "failed" as const, result: null };
    }

    // 5. Open the new placement history row against the new location.
    await client.from("plaque_placement_history").insert({
      plaque_id: plaque.id,
      location_id: locationId,
      placement_type: data.newPlacement,
      placement_name: data.newPlacement,
      effective_from: now,
      changed_by_user_id: caller.userId,
      reason: "Reassigned to another business",
    });

    const payload = {
      plaque_code: plaque.plaque_code,
      slug: plaque.public_slug,
      old_business_id: plaque.business_id,
      old_location_id: plaque.location_id,
      old_placement: plaque.placement_type,
      old_destination: oldDestination ? { type: oldDestination.destination_type, url: oldDestination.url } : null,
      new_business_id: data.newBusinessId,
      new_business_name: newBusiness.name,
      new_location_id: locationId,
      new_placement: data.newPlacement,
      new_destination: { type: data.newDestinationType, url },
      at: now,
    };

    // 6. Record the move on both business timelines. Memberships are never moved.
    if (plaque.business_id) {
      await client.from("action_history").insert({
        business_id: plaque.business_id,
        plaque_id: plaque.id,
        action_type: "plaque_reassigned",
        previous_value: payload as never,
        new_value: payload as never,
        initiated_by: "admin",
        approved_by_user_id: caller.userId,
      });
    }
    await client.from("action_history").insert({
      business_id: data.newBusinessId,
      plaque_id: plaque.id,
      action_type: "plaque_reassigned",
      previous_value: payload as never,
      new_value: payload as never,
      initiated_by: "admin",
      approved_by_user_id: caller.userId,
    });

    const { data: finalLocation } = locationId
      ? await client.from("locations").select("id, name, address, city").eq("id", locationId).maybeSingle()
      : { data: null };

    return {
      ok: true as const,
      error: null,
      result: {
        plaqueId: plaque.id,
        plaqueCode: plaque.plaque_code,
        slug: plaque.public_slug,
        nfcUrl: nfcUrl(plaque.public_slug),
        qrUrl: qrUrl(plaque.public_slug),
        businessId: data.newBusinessId,
        businessName: newBusiness.name,
        locationId,
        address: [finalLocation?.address, finalLocation?.city].filter(Boolean).join(", ") || null,
        placeKey: locationId ?? `b_${data.newBusinessId}`,
        placement: data.newPlacement,
        destinationType: data.newDestinationType,
        destinationUrl: url,
      },
    };
  });
