import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Admin-only business discovery: find a real business on Google and add it to
 * TapLocal. Google data here is PUBLIC listing data — it identifies a business,
 * it never proves ownership. Every call verifies the caller is a TapLocal admin.
 */

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type GoogleSearchError = "unauthorized" | "forbidden" | "not_configured" | "rate_limited" | "failed";

/** Live Google Places suggestions, annotated with whether we already hold them. */
export const adminSearchGoogle = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ query: z.string().min(3).max(120), sessionToken: z.string().min(6).max(64) }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error as GoogleSearchError, results: [] };

    const { allowRequest } = await import("./activation-guard.server");
    if (!(await allowRequest("admin-places-search", 200))) {
      return { ok: false as const, error: "rate_limited" as const, results: [] };
    }

    const { autocompleteBusinesses } = await import("./google-places.server");
    let suggestions;
    try {
      suggestions = await autocompleteBusinesses(data.query, data.sessionToken);
    } catch (err) {
      const notConfigured = err instanceof Error && err.message === "google_places_not_configured";
      return { ok: false as const, error: (notConfigured ? "not_configured" : "failed") as GoogleSearchError, results: [] };
    }

    const client = await db();
    const placeIds = suggestions.map((s) => s.placeId);
    const existing = placeIds.length
      ? (await client.from("locations").select("business_id, google_place_id").in("google_place_id", placeIds)).data
      : [];

    return {
      ok: true as const,
      error: null,
      results: suggestions.map((s) => ({
        ...s,
        existingBusinessId: (existing ?? []).find((l) => l.google_place_id === s.placeId)?.business_id ?? null,
      })),
    };
  });

/** Full public listing detail for one place, before the admin confirms adding it. */
export const adminGooglePlaceDetails = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ placeId: z.string().min(4).max(300), sessionToken: z.string().min(6).max(64).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error as GoogleSearchError, place: null, existingBusinessId: null };

    const { placeDetails } = await import("./google-places.server");
    let place;
    try {
      place = await placeDetails(data.placeId, data.sessionToken);
    } catch (err) {
      const notConfigured = err instanceof Error && err.message === "google_places_not_configured";
      return {
        ok: false as const,
        error: (notConfigured ? "not_configured" : "failed") as GoogleSearchError,
        place: null,
        existingBusinessId: null,
      };
    }
    if (!place) return { ok: false as const, error: "failed" as GoogleSearchError, place: null, existingBusinessId: null };

    const client = await db();
    const { data: existing } = await client
      .from("locations")
      .select("business_id")
      .eq("google_place_id", data.placeId)
      .maybeSingle();

    return { ok: true as const, error: null, place, existingBusinessId: existing?.business_id ?? null };
  });

/**
 * Create a real (admin-managed, owner-unclaimed) business + location from a
 * confirmed Google Place. The Place ID is the deduplication key.
 */
export const adminCreateBusinessFromPlace = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ placeId: z.string().min(4).max(300), sessionToken: z.string().min(6).max(64).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error as GoogleSearchError, businessId: null, duplicate: false };

    const client = await db();
    const { data: existing } = await client
      .from("locations")
      .select("business_id")
      .eq("google_place_id", data.placeId)
      .maybeSingle();
    if (existing?.business_id) {
      return { ok: true as const, error: null, businessId: existing.business_id, duplicate: true };
    }

    const { placeDetails } = await import("./google-places.server");
    let place;
    try {
      place = await placeDetails(data.placeId, data.sessionToken);
    } catch (err) {
      const notConfigured = err instanceof Error && err.message === "google_places_not_configured";
      return {
        ok: false as const,
        error: (notConfigured ? "not_configured" : "failed") as GoogleSearchError,
        businessId: null,
        duplicate: false,
      };
    }
    if (!place) return { ok: false as const, error: "failed" as GoogleSearchError, businessId: null, duplicate: false };

    const { data: business, error: businessError } = await client
      .from("businesses")
      .insert({
        name: place.name || "Unnamed business",
        industry: place.primaryType ?? "Local business",
        timezone: "America/Toronto",
        status: "active",
        is_demo: false,
      })
      .select("id")
      .single();
    if (businessError || !business) {
      return { ok: false as const, error: "failed" as GoogleSearchError, businessId: null, duplicate: false };
    }

    const { error: locationError } = await client.from("locations").insert({
      business_id: business.id,
      name: place.name || "Main location",
      address: place.formattedAddress || null,
      city: place.city,
      province_state: place.region,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
      phone: place.phone,
      website_url: place.website,
      google_place_id: place.placeId,
      google_maps_uri: place.mapsUri,
      google_rating: place.rating,
      google_review_count: place.reviewCount,
      google_business_status: place.businessStatus,
      google_primary_type: place.primaryType,
      public_data_last_synced_at: new Date().toISOString(),
      active: true,
    });
    if (locationError) {
      await client.from("businesses").delete().eq("id", business.id);
      return { ok: false as const, error: "failed" as GoogleSearchError, businessId: null, duplicate: false };
    }

    await client.from("action_history").insert({
      business_id: business.id,
      action_type: "business_created_from_google",
      new_value: { place_id: place.placeId, name: place.name } as never,
      initiated_by: "admin",
      approved_by_user_id: caller.userId,
    });

    return { ok: true as const, error: null, businessId: business.id, duplicate: false };
  });
