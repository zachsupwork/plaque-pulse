import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Admin-only Google Business connection: find the real listing, keep its public
 * data fresh, and hold Google's own "write a review" link so plaques never point
 * at a guessed URL. Physical tags always carry the TapLocal SmartLink; only the
 * destination behind it changes here.
 */

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type GoogleLinkError =
  | "unauthorized"
  | "forbidden"
  | "not_configured"
  | "rate_limited"
  | "not_found"
  | "no_place_id"
  | "unavailable"
  | "invalid_url"
  | "failed";

export type GoogleConnection = {
  locationId: string;
  name: string;
  address: string | null;
  city: string | null;
  placeId: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  mapsUri: string | null;
  reviewUrl: string | null;
  reviewUrlSource: string | null;
  reviewUrlCheckedAt: string | null;
  lastSyncedAt: string | null;
};

const LOCATION_FIELDS =
  "id, name, address, city, google_place_id, google_rating, google_review_count, google_business_status, google_maps_uri, google_review_url, google_review_url_source, google_review_url_checked_at, public_data_last_synced_at";

type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  google_place_id: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_business_status: string | null;
  google_maps_uri: string | null;
  google_review_url: string | null;
  google_review_url_source: string | null;
  google_review_url_checked_at: string | null;
  public_data_last_synced_at: string | null;
};

function toConnection(l: LocationRow): GoogleConnection {
  return {
    locationId: l.id,
    name: l.name,
    address: l.address,
    city: l.city,
    placeId: l.google_place_id,
    rating: l.google_rating,
    reviewCount: l.google_review_count,
    businessStatus: l.google_business_status,
    mapsUri: l.google_maps_uri,
    reviewUrl: l.google_review_url,
    reviewUrlSource: l.google_review_url_source,
    reviewUrlCheckedAt: l.google_review_url_checked_at,
    lastSyncedAt: l.public_data_last_synced_at,
  };
}

/** Every location of a business plus its Google connection state. */
export const getGoogleConnections = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ businessId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error as GoogleLinkError, connections: [] };

    const client = await db();
    const { data: rows } = await client
      .from("locations")
      .select(LOCATION_FIELDS)
      .eq("business_id", data.businessId)
      .order("created_at", { ascending: true });

    return { ok: true as const, error: null, connections: ((rows ?? []) as LocationRow[]).map(toConnection) };
  });

/** Google text search with rating and review count so the admin picks the right listing. */
export const searchGoogleBusinesses = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ query: z.string().min(3).max(160) }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error as GoogleLinkError, results: [] };

    const { allowRequest } = await import("./activation-guard.server");
    if (!(await allowRequest("admin-places-search", 200))) {
      return { ok: false as const, error: "rate_limited" as const, results: [] };
    }

    const { searchBusinessesDetailed } = await import("./google-places.server");
    try {
      return { ok: true as const, error: null, results: await searchBusinessesDetailed(data.query) };
    } catch (err) {
      const notConfigured = err instanceof Error && err.message === "google_places_not_configured";
      return {
        ok: false as const,
        error: (notConfigured ? "not_configured" : "failed") as GoogleLinkError,
        results: [],
      };
    }
  });

/** Point a location at a confirmed Google listing and pull its review link. */
export const connectGooglePlace = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        locationId: z.string().uuid().nullable().optional(),
        placeId: z.string().min(5).max(300),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error as GoogleLinkError, connection: null };

    const client = await db();
    let locationId = data.locationId ?? null;

    if (!locationId) {
      const { data: created } = await client
        .from("locations")
        .insert({ business_id: data.businessId, name: "New location", active: true })
        .select("id")
        .single();
      locationId = created?.id ?? null;
    }
    if (!locationId) return { ok: false as const, error: "failed" as const, connection: null };

    const { syncLocationFromGoogle } = await import("./google-link.server");
    const result = await syncLocationFromGoogle(client, locationId, data.placeId);

    await client.from("action_history").insert({
      business_id: data.businessId,
      action_type: "google_business_connected",
      new_value: { placeId: data.placeId, reviewUrl: result.url },
      initiated_by: "admin",
      approved_by_user_id: caller.userId,
    });

    const { data: row } = await client.from("locations").select(LOCATION_FIELDS).eq("id", locationId).maybeSingle();
    return {
      ok: true as const,
      error: result.error as GoogleLinkError | null,
      connection: row ? toConnection(row as LocationRow) : null,
    };
  });

/** Re-read the same Place ID from Google — no new search needed. */
export const refreshGoogleConnection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ locationId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error as GoogleLinkError, connection: null };

    const client = await db();
    const { data: row } = await client.from("locations").select(LOCATION_FIELDS).eq("id", data.locationId).maybeSingle();
    if (!row) return { ok: false as const, error: "not_found" as const, connection: null };
    const location = row as LocationRow;
    if (!location.google_place_id) return { ok: false as const, error: "no_place_id" as const, connection: toConnection(location) };

    const { syncLocationFromGoogle } = await import("./google-link.server");
    const result = await syncLocationFromGoogle(client, location.id, location.google_place_id);

    const { data: fresh } = await client.from("locations").select(LOCATION_FIELDS).eq("id", data.locationId).maybeSingle();
    return {
      ok: true as const,
      error: result.error as GoogleLinkError | null,
      connection: fresh ? toConnection(fresh as LocationRow) : null,
    };
  });

/** Advanced override: an admin pastes a review link themselves. */
export const setManualReviewUrl = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ locationId: z.string().uuid(), url: z.string().min(8).max(2000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error as GoogleLinkError, connection: null, warning: null };

    const url = data.url.trim();
    let valid = false;
    try {
      valid = new URL(url).protocol === "https:";
    } catch {
      valid = false;
    }
    if (!valid) return { ok: false as const, error: "invalid_url" as const, connection: null, warning: null };

    const { isGoogleUrl } = await import("./google-places.server");
    const warning = isGoogleUrl(url) ? null : "This link is not a Google address — customers may not land on a review box.";

    const client = await db();
    const now = new Date().toISOString();
    await client
      .from("locations")
      .update({ google_review_url: url, google_review_url_source: "manual", google_review_url_checked_at: now })
      .eq("id", data.locationId);

    const { data: fresh } = await client.from("locations").select(LOCATION_FIELDS).eq("id", data.locationId).maybeSingle();
    return { ok: true as const, error: null, warning, connection: fresh ? toConnection(fresh as LocationRow) : null };
  });

/** How many locations still need a direct review link. */
export const googleLinkMaintenance = createServerFn({ method: "POST" }).handler(async () => {
  const caller = await gate();
  if (!caller.ok) return { ok: false as const, error: caller.error as GoogleLinkError, missing: [], linked: 0 };

  const client = await db();
  const { data: rows } = await client
    .from("locations")
    .select("id, name, business_id, google_place_id, google_review_url")
    .not("google_place_id", "is", null);

  const all = rows ?? [];
  return {
    ok: true as const,
    error: null,
    linked: all.filter((r) => r.google_review_url).length,
    missing: all
      .filter((r) => !r.google_review_url)
      .map((r) => ({ locationId: r.id, name: r.name, businessId: r.business_id })),
  };
});

/** Fetch the direct review link for every location that has a Place ID but no link. */
export const backfillReviewLinks = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ limit: z.number().int().min(1).max(50).default(20) }).parse(data ?? {}))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error as GoogleLinkError, fixed: 0, failed: 0 };

    const client = await db();
    const { data: rows } = await client
      .from("locations")
      .select("id, google_place_id")
      .not("google_place_id", "is", null)
      .is("google_review_url", null)
      .limit(data.limit);

    const { syncLocationFromGoogle } = await import("./google-link.server");
    let fixed = 0;
    let failed = 0;
    for (const row of rows ?? []) {
      const result = await syncLocationFromGoogle(client, row.id, row.google_place_id!);
      if (result.url) fixed += 1;
      else failed += 1;
    }
    return { ok: true as const, error: null, fixed, failed };
  });
