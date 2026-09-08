/**
 * Server-only helpers for bulk area preparation.
 *
 * These reuse the same identity rules as single-plaque provisioning: a Google
 * Place ID is the deduplication key for a business, and a plaque's code, slug
 * and permanent SmartLinks are minted once and never regenerated.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { nfcUrl, qrUrl } from "@/lib/smartlink";
import { placeDetails } from "@/lib/google-places.server";

type Client = SupabaseClient<any, any, any>;

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomFrom(length: number) {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function activationCode() {
  const chars = randomFrom(8);
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export function randomSlug() {
  return randomFrom(6);
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type EnsuredBusiness = {
  businessId: string;
  locationId: string | null;
  reused: boolean;
  reviewUrl: string | null;
  website: string | null;
};

/**
 * Reuse the TapLocal business behind a Google Place ID, or create it. Never
 * creates a second business for a place we already hold.
 */
export async function ensureBusinessFromPlace(
  client: Client,
  placeId: string,
  userId: string,
): Promise<EnsuredBusiness | null> {
  const { data: existing } = await client
    .from("locations")
    .select("id, business_id, google_review_url, website_url")
    .eq("google_place_id", placeId)
    .maybeSingle();

  if (existing?.business_id) {
    return {
      businessId: existing.business_id,
      locationId: existing.id,
      reused: true,
      reviewUrl: existing.google_review_url ?? null,
      website: existing.website_url ?? null,
    };
  }

  const place = await placeDetails(placeId);
  if (!place) return null;

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
  if (businessError || !business) return null;

  const { data: location, error: locationError } = await client
    .from("locations")
    .insert({
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
      ...(place.writeAReviewUri
        ? {
            google_review_url: place.writeAReviewUri,
            google_review_url_source: "google_api",
            google_review_url_checked_at: new Date().toISOString(),
          }
        : {}),
      public_data_last_synced_at: new Date().toISOString(),
      active: true,
    })
    .select("id")
    .single();

  if (locationError || !location) {
    await client.from("businesses").delete().eq("id", business.id);
    return null;
  }

  await client.from("action_history").insert({
    business_id: business.id,
    action_type: "business_created_from_google",
    new_value: { place_id: place.placeId, name: place.name, source: "area_builder" } as never,
    initiated_by: "admin",
    approved_by_user_id: userId,
  });

  return {
    businessId: business.id,
    locationId: location.id,
    reused: false,
    reviewUrl: place.writeAReviewUri ?? null,
    website: place.website ?? null,
  };
}

export type CreatedPlaque = {
  id: string;
  plaqueCode: string;
  publicSlug: string;
  nfcUrl: string;
  qrUrl: string;
  activationCode: string;
};

/** Mint one real plaque identity attached to a business/location. */
export async function createPlaqueForBusiness(
  client: Client,
  input: {
    businessId: string;
    locationId: string | null;
    batchCode: string;
    productType?: string;
    style?: string;
    baseType?: string;
    userId: string;
  },
): Promise<CreatedPlaque | null> {
  const code = activationCode();
  const publicSlug = randomSlug();
  const plaqueCode = `TL-${Math.floor(100000 + Math.random() * 899999)}`;

  const { data: row, error } = await client
    .from("plaques")
    .insert({
      plaque_code: plaqueCode,
      public_slug: publicSlug,
      activation_token_hash: await sha256Hex(code),
      product_type: input.productType ?? "google_review_plaque",
      style: input.style ?? "cloud_white",
      base_type: input.baseType ?? "clear_acrylic",
      batch_id: input.batchCode,
      status: "inventory",
      business_id: input.businessId,
      location_id: input.locationId,
    })
    .select("id")
    .maybeSingle();
  if (error || !row) return null;

  await client.from("plaque_programming").insert({
    plaque_id: row.id,
    batch_id: input.batchCode,
    expected_nfc_url: nfcUrl(publicSlug),
  });

  await client.from("action_history").insert({
    business_id: input.businessId,
    plaque_id: row.id,
    action_type: "plaque_created_for_place",
    new_value: { plaque_code: plaqueCode, slug: publicSlug, batch: input.batchCode, source: "area_builder" } as never,
    initiated_by: "admin",
    approved_by_user_id: input.userId,
  });

  return {
    id: row.id,
    plaqueCode,
    publicSlug,
    nfcUrl: nfcUrl(publicSlug),
    qrUrl: qrUrl(publicSlug),
    activationCode: code,
  };
}

/** Set the plaque's opening destination to the business's Google review box. */
export async function setInitialGoogleReviewDestination(
  client: Client,
  input: { businessId: string; plaqueId: string; url: string },
) {
  const { data: current } = await client
    .from("destinations")
    .select("id")
    .eq("plaque_id", input.plaqueId)
    .is("effective_to", null)
    .maybeSingle();
  if (current) return;

  await client.from("destinations").insert({
    business_id: input.businessId,
    plaque_id: input.plaqueId,
    destination_type: "google_review",
    url: input.url,
    active: true,
    effective_from: new Date().toISOString(),
  });
}
