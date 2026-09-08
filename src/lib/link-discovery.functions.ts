import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { LinkCandidate, LinkKind, LinkResult } from "./link-discovery.server";

/**
 * Admin-only destination research for one physical plaque.
 *
 * Everything expensive runs server-side. Discovery is always scoped to the
 * plaque's CURRENT business + location + Google Place ID, so a reassigned
 * plaque never reuses the previous business's links. Confirmed values are
 * cached on the location so the next plaque at the same place is instant.
 */

const KINDS = ["website", "menu", "booking", "facebook", "tiktok"] as const;

export type LinkError = "unauthorized" | "forbidden" | "not_found" | "not_assigned" | "rate_limited" | "failed";

export type SavedLink = { kind: LinkKind; url: string; label: string; source: string; confidence: number };

export type PlaqueLinkContext = {
  businessId: string;
  locationId: string | null;
  businessName: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  placeId: string | null;
  mapsUri: string | null;
  reviewUrl: string | null;
  reviewUrlSource: string | null;
  saved: SavedLink[];
};

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Ctx = Awaited<ReturnType<typeof loadPlaqueContext>>;

async function loadPlaqueContext(plaqueId: string) {
  const client = await db();
  const { data: plaque } = await client
    .from("plaques")
    .select("id, business_id, location_id")
    .eq("id", plaqueId)
    .maybeSingle();
  if (!plaque?.business_id) return null;

  const [{ data: business }, { data: location }] = await Promise.all([
    client.from("businesses").select("id, name").eq("id", plaque.business_id).maybeSingle(),
    plaque.location_id
      ? client
          .from("locations")
          .select(
            "id, name, address, city, province_state, country, phone, website_url, google_place_id, google_maps_uri, google_review_url, google_review_url_source, google_primary_type",
          )
          .eq("id", plaque.location_id)
          .maybeSingle()
      : client
          .from("locations")
          .select(
            "id, name, address, city, province_state, country, phone, website_url, google_place_id, google_maps_uri, google_review_url, google_review_url_source, google_primary_type",
          )
          .eq("business_id", plaque.business_id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
  ]);
  if (!business) return null;

  return { businessId: business.id, businessName: business.name, location: location ?? null };
}

/** The shape instagram/link discovery scoring expects. */
function toBusinessContext(ctx: NonNullable<Ctx>) {
  const l = ctx.location;
  return {
    businessId: ctx.businessId,
    locationId: l?.id ?? null,
    googlePlaceId: l?.google_place_id ?? null,
    businessName: ctx.businessName,
    formattedAddress: l?.address ?? null,
    city: l?.city ?? null,
    region: l?.province_state ?? null,
    country: l?.country ?? null,
    phone: l?.phone ?? null,
    website: l?.website_url ?? null,
    googleMapsUrl: l?.google_maps_uri ?? null,
    primaryCategory: l?.google_primary_type ?? null,
  };
}

async function loadSaved(businessId: string, locationId: string | null): Promise<SavedLink[]> {
  const client = await db();
  const { data: rows } = await client
    .from("business_social_profiles")
    .select("platform, username, profile_url, source, confidence, verification_status, location_id")
    .eq("business_id", businessId)
    .in("platform", KINDS as unknown as string[])
    .neq("verification_status", "rejected");

  return (rows ?? [])
    .filter((r) => !locationId || !r.location_id || r.location_id === locationId)
    .map((r) => ({
      kind: r.platform as LinkKind,
      url: r.profile_url,
      label: r.username,
      source: r.source === "admin_confirmed" ? "Admin confirmed" : "Found for this business",
      confidence: r.confidence,
    }));
}

/** Everything the Change destination drawer knows before any search runs. */
export const plaqueLinkContext = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error as LinkError, context: null };

    const ctx = await loadPlaqueContext(data.plaqueId);
    if (!ctx) return { ok: false as const, error: "not_assigned" as LinkError, context: null };

    const l = ctx.location;
    const context: PlaqueLinkContext = {
      businessId: ctx.businessId,
      locationId: l?.id ?? null,
      businessName: ctx.businessName,
      address: l?.address ?? null,
      city: l?.city ?? null,
      phone: l?.phone ?? null,
      website: l?.website_url ?? null,
      placeId: l?.google_place_id ?? null,
      mapsUri: l?.google_maps_uri ?? null,
      reviewUrl: l?.google_review_url ?? null,
      reviewUrlSource: l?.google_review_url_source ?? null,
      saved: await loadSaved(ctx.businessId, l?.id ?? null),
    };
    return { ok: true as const, error: null, context };
  });

/**
 * Find one kind of destination link for the plaque's current business.
 * Instagram is deliberately excluded — it uses the existing Instagram system.
 */
export const discoverPlaqueLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        plaqueId: z.string().uuid(),
        kind: z.enum(KINDS),
        deep: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) {
      return { ok: false as const, error: caller.error as LinkError, result: null, savedWebsite: null };
    }

    const { allowRequest } = await import("./activation-guard.server");
    if (!(await allowRequest("link-discovery-admin", 400))) {
      return { ok: false as const, error: "rate_limited" as LinkError, result: null, savedWebsite: null };
    }

    const ctx = await loadPlaqueContext(data.plaqueId);
    if (!ctx) return { ok: false as const, error: "not_assigned" as LinkError, result: null, savedWebsite: null };

    let business = toBusinessContext(ctx);
    let savedWebsite: string | null = null;

    // No website on file yet? Refresh the public Google listing first — it is
    // the cheapest and most trustworthy source, and it unlocks every other kind.
    if (!business.website && business.googlePlaceId && ctx.location) {
      try {
        const { placeDetails } = await import("./google-places.server");
        const place = await placeDetails(business.googlePlaceId);
        if (place?.website) {
          const client = await db();
          await client
            .from("locations")
            .update({
              website_url: place.website,
              ...(place.phone ? { phone: place.phone } : {}),
              public_data_last_synced_at: new Date().toISOString(),
            })
            .eq("id", ctx.location.id);
          business = { ...business, website: place.website, phone: place.phone ?? business.phone };
          savedWebsite = place.website;
        }
      } catch {
        /* Google unavailable — fall through to the other sources. */
      }
    }

    try {
      const { discoverLinkFor } = await import("./link-discovery.server");
      const result = await discoverLinkFor(business, data.kind, Boolean(data.deep));
      return { ok: true as const, error: null, result: result as LinkResult, savedWebsite };
    } catch (err) {
      console.error("[link-discovery] failed", err);
      return { ok: false as const, error: "failed" as LinkError, result: null, savedWebsite };
    }
  });

/**
 * Remember a link the admin confirmed, so every other plaque at this place
 * reuses it instantly instead of researching again.
 */
export const savePlaqueLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        plaqueId: z.string().uuid(),
        kind: z.enum(KINDS),
        url: z.string().min(4).max(600),
        label: z.string().max(120).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error as LinkError };

    const ctx = await loadPlaqueContext(data.plaqueId);
    if (!ctx) return { ok: false as const, error: "not_assigned" as LinkError };

    const { safeUrl } = await import("./destinations");
    const url = safeUrl(data.url);
    if (!url) return { ok: false as const, error: "failed" as LinkError };

    const { hostOf } = await import("./link-discovery.server");
    const client = await db();
    const now = new Date().toISOString();

    if (data.kind === "website" && ctx.location) {
      await client.from("locations").update({ website_url: url }).eq("id", ctx.location.id);
    }

    const row = {
      business_id: ctx.businessId,
      location_id: ctx.location?.id ?? null,
      platform: data.kind,
      username: (data.label || hostOf(url) || data.kind).slice(0, 120),
      profile_url: url,
      scope: "location",
      confidence: 100,
      verification_status: "manual",
      source: "admin_confirmed",
      evidence: [{ label: "Confirmed by a TapLocal admin", weight: 100, source: "admin" }] as never,
      verified_at: now,
      verified_by_user_id: caller.userId,
      last_checked_at: now,
    };

    const { data: existing } = await client
      .from("business_social_profiles")
      .select("id")
      .eq("business_id", ctx.businessId)
      .eq("platform", data.kind)
      .eq("profile_url", url)
      .maybeSingle();

    if (existing) await client.from("business_social_profiles").update(row).eq("id", existing.id);
    else await client.from("business_social_profiles").insert(row);

    return { ok: true as const, error: null };
  });

export type { LinkCandidate, LinkKind, LinkResult };
