import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nfcUrl, qrUrl } from "@/lib/smartlink";

/**
 * The all-in-one setup workbench: one business, one plaque, one destination, live.
 *
 * The physical tag NEVER carries the customer destination. It always carries
 * nfcUrl(slug); the destination lives in the destinations table so it can change
 * at any time without reprogramming or reprinting anything.
 */

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function since(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Everything the workbench needs about the chosen business. */
export const workbenchBusiness = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ businessId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, business: null };
    const client = await db();

    const { data: business } = await client
      .from("businesses")
      .select("id, name, industry")
      .eq("id", data.businessId)
      .maybeSingle();
    if (!business) return { ok: true as const, error: null, business: null };

    const { data: locations } = await client
      .from("locations")
      .select("id, name, address, city, province_state, website_url, phone, google_place_id, google_maps_uri, google_rating, google_review_count")
      .eq("business_id", business.id)
      .order("created_at", { ascending: true });

    return { ok: true as const, error: null, business: { ...business, locations: locations ?? [] } };
  });

/** Plaques that are not attached to any business yet. */
export const availableInventory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ query: z.string().max(60).default("") }).parse(data ?? {}))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, plaques: [] };
    const client = await db();

    let request = client
      .from("plaques")
      .select("id, plaque_code, public_slug, product_type, style, base_type, batch_id, status, business_id")
      .is("business_id", null)
      .in("status", ["inventory", "packed", "sold", "configured_unclaimed"])
      .order("created_at", { ascending: false })
      .limit(24);

    const q = data.query.trim();
    if (q) request = request.or(`plaque_code.ilike.%${q}%,public_slug.ilike.%${q}%,batch_id.ilike.%${q}%`);

    const { data: plaques } = await request;
    const ids = (plaques ?? []).map((p) => p.id);
    const { data: programming } = ids.length
      ? await client.from("plaque_programming").select("plaque_id, write_status, verification_status").in("plaque_id", ids)
      : { data: [] };

    return {
      ok: true as const,
      error: null,
      plaques: (plaques ?? []).map((p) => {
        const prog = (programming ?? []).find((x) => x.plaque_id === p.id);
        return {
          ...p,
          writeStatus: prog?.write_status ?? "not_programmed",
          verificationStatus: prog?.verification_status ?? "not_verified",
        };
      }),
    };
  });

const configureSchema = z.object({
  plaqueId: z.string().uuid(),
  businessId: z.string().uuid(),
  locationId: z.string().uuid().nullish(),
  placement: z.string().max(40).nullish(),
  destinationType: z.string().min(1).max(40),
  /** Already-built destination URL. Omitted for Google Reviews / Directions. */
  url: z.string().max(600).nullish(),
});

/**
 * Attach the plaque to the business, set its placement and open its destination —
 * in one step, so the operator never has to visit three screens.
 */
export const configurePlaque = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => configureSchema.parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, url: null };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, public_slug, business_id, placement_type, location_id")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const, url: null };
    if (plaque.business_id && plaque.business_id !== data.businessId) {
      return { ok: false as const, error: "already_assigned" as const, url: null };
    }

    // Resolve the destination we derive ourselves from the Google listing.
    let url = data.url?.trim() || "";
    if (!url && (data.destinationType === "google_review" || data.destinationType === "directions")) {
      const { data: location } = await client
        .from("locations")
        .select("google_place_id, google_maps_uri")
        .eq("id", data.locationId ?? "00000000-0000-0000-0000-000000000000")
        .maybeSingle();
      if (data.destinationType === "google_review") {
        // Google's own write-a-review link, stored on the location.
        const { reviewDestinationForLocation } = await import("./google-link.server");
        url = (await reviewDestinationForLocation(client, data.locationId ?? null)).url ?? "";
      } else if (data.destinationType === "directions") {
        url =
          location?.google_maps_uri ??
          (location?.google_place_id
            ? `https://www.google.com/maps/search/?api=1&query=place&query_place_id=${encodeURIComponent(location.google_place_id)}`
            : "");
      }
    }
    if (!url) return { ok: false as const, error: "no_destination" as const, url: null };

    const now = new Date().toISOString();

    await client
      .from("plaques")
      .update({
        business_id: data.businessId,
        location_id: data.locationId ?? plaque.location_id,
        placement_type: data.placement ?? plaque.placement_type,
        configured_at: now,
      })
      .eq("id", plaque.id);

    if (data.placement && data.placement !== plaque.placement_type) {
      await client
        .from("plaque_placement_history")
        .update({ effective_to: now })
        .eq("plaque_id", plaque.id)
        .is("effective_to", null);
      await client.from("plaque_placement_history").insert({
        plaque_id: plaque.id,
        location_id: data.locationId ?? plaque.location_id,
        placement_type: data.placement,
        placement_name: data.placement,
        effective_from: now,
        changed_by_user_id: caller.userId,
      });
    }

    const { data: current } = await client
      .from("destinations")
      .select("id, destination_type, url")
      .eq("plaque_id", plaque.id)
      .is("effective_to", null)
      .maybeSingle();

    if (current?.url !== url || current?.destination_type !== data.destinationType) {
      if (current) await client.from("destinations").update({ effective_to: now, active: false }).eq("id", current.id);
      await client.from("destinations").insert({
        business_id: data.businessId,
        plaque_id: plaque.id,
        destination_type: data.destinationType as never,
        url,
        active: true,
        effective_from: now,
      });
    }

    await client.from("action_history").insert({
      business_id: data.businessId,
      plaque_id: plaque.id,
      action_type: "plaque_configured",
      new_value: { destination_type: data.destinationType, url, placement: data.placement } as never,
      initiated_by: "admin",
      approved_by_user_id: caller.userId,
    });

    return { ok: true as const, error: null, url };
  });

/** Final step: the plaque is on the counter and counting. */
export const makePlaqueLive = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, business_id, status, activated_at")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque?.business_id) return { ok: false as const, error: "not_assigned" as const };

    const { data: destination } = await client
      .from("destinations")
      .select("id")
      .eq("plaque_id", plaque.id)
      .is("effective_to", null)
      .maybeSingle();
    if (!destination) return { ok: false as const, error: "no_destination" as const };

    await client
      .from("plaques")
      .update({ status: "active", activated_at: plaque.activated_at ?? new Date().toISOString() })
      .eq("id", plaque.id);

    await client.from("action_history").insert({
      business_id: plaque.business_id,
      plaque_id: plaque.id,
      action_type: "plaque_activated",
      previous_value: { status: plaque.status } as never,
      new_value: { status: "active" } as never,
      initiated_by: "admin",
      approved_by_user_id: caller.userId,
    });

    return { ok: true as const };
  });

/** Live monitoring for a single plaque, shown on the same page after going live. */
export const plaqueLiveStats = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, stats: null };
    const client = await db();

    const [{ data: plaque }, { data: events }, { data: destination }] = await Promise.all([
      client
        .from("plaques")
        .select("id, plaque_code, public_slug, status, placement_type, business_id, activated_at")
        .eq("id", data.plaqueId)
        .maybeSingle(),
      client
        .from("events")
        .select("event_type, source_type, occurred_at")
        .eq("plaque_id", data.plaqueId)
        .eq("event_type", "interaction")
        .order("occurred_at", { ascending: false })
        .limit(20000),
      client
        .from("destinations")
        .select("destination_type, url")
        .eq("plaque_id", data.plaqueId)
        .is("effective_to", null)
        .maybeSingle(),
    ]);
    if (!plaque) return { ok: true as const, error: null, stats: null };

    const rows = events ?? [];
    const inWindow = (iso: string) => rows.filter((e) => e.occurred_at >= iso).length;

    return {
      ok: true as const,
      error: null,
      stats: {
        plaqueCode: plaque.plaque_code,
        slug: plaque.public_slug,
        status: plaque.status,
        placement: plaque.placement_type,
        nfcUrl: nfcUrl(plaque.public_slug),
        qrUrl: qrUrl(plaque.public_slug),
        today: inWindow(startOfToday()),
        days7: inWindow(since(7)),
        days30: inWindow(since(30)),
        allTime: rows.length,
        nfc: rows.filter((e) => e.source_type === "nfc").length,
        qr: rows.filter((e) => e.source_type === "qr").length,
        lastInteraction: rows[0]?.occurred_at ?? null,
        destination: destination ? { type: destination.destination_type, url: destination.url } : null,
      },
    };
  });
