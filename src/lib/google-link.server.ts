/**
 * The Google review destination for a business location.
 *
 * Source of truth: googleMapsLinks.writeAReviewUri from Google Place Details.
 * It is stored on the location so every plaque, QR and SmartLink resolves the
 * same link, and so the admin can repair it later without touching hardware.
 *
 * Server-only: this module talks to Google with the server API key.
 */

import { placeDetails, googleReviewUrl } from "./google-places.server";

export type ReviewLinkSource = "google_api" | "manual" | "fallback";

export type ReviewLinkResult = {
  url: string | null;
  source: ReviewLinkSource | null;
  /** Only set when Google gave us nothing. */
  error: "no_place_id" | "not_configured" | "unavailable" | null;
};

type Client = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

/** Re-reads one place from Google and writes every public field back to the location. */
export async function syncLocationFromGoogle(
  client: Client,
  locationId: string,
  placeId: string,
): Promise<ReviewLinkResult & { name: string | null }> {
  let place;
  try {
    place = await placeDetails(placeId);
  } catch (err) {
    const notConfigured = err instanceof Error && err.message === "google_places_not_configured";
    return { url: null, source: null, error: notConfigured ? "not_configured" : "unavailable", name: null };
  }
  if (!place) return { url: null, source: null, error: "unavailable", name: null };

  const reviewUrl = place.writeAReviewUri;
  const now = new Date().toISOString();

  await client
    .from("locations")
    .update({
      name: place.name || undefined,
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
      public_data_last_synced_at: now,
      // Only overwrite the review link when Google actually returned one.
      ...(reviewUrl
        ? { google_review_url: reviewUrl, google_review_url_source: "google_api", google_review_url_checked_at: now }
        : { google_review_url_checked_at: now }),
    })
    .eq("id", locationId);

  return {
    url: reviewUrl,
    source: reviewUrl ? "google_api" : null,
    error: reviewUrl ? null : "unavailable",
    name: place.name || null,
  };
}

/**
 * The review link a plaque should point at. Prefers the stored link, fetches it
 * from Google when it's missing, and only falls back to the generic Google
 * review form as a last resort — never to a search page or another business.
 */
export async function reviewDestinationForLocation(
  client: Client,
  locationId: string | null | undefined,
): Promise<ReviewLinkResult> {
  if (!locationId) return { url: null, source: null, error: "no_place_id" };

  const { data: location } = await client
    .from("locations")
    .select("id, google_place_id, google_review_url, google_review_url_source")
    .eq("id", locationId)
    .maybeSingle();

  if (location?.google_review_url) {
    return {
      url: location.google_review_url,
      source: (location.google_review_url_source as ReviewLinkSource) ?? "google_api",
      error: null,
    };
  }
  if (!location?.google_place_id) return { url: null, source: null, error: "no_place_id" };

  const fresh = await syncLocationFromGoogle(client, location.id, location.google_place_id);
  if (fresh.url) return { url: fresh.url, source: "google_api", error: null };

  return { url: googleReviewUrl(location.google_place_id), source: "fallback", error: fresh.error };
}
