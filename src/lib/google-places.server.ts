/**
 * Google Places (New) access. Server-only: the key never reaches the browser.
 * We only ever read PUBLIC listing data — this identifies a business, it never proves ownership.
 */

const PLACES = "https://places.googleapis.com/v1";

export type PlaceSuggestion = {
  placeId: string;
  name: string;
  address: string;
  category: string | null;
};

export type PlaceDetails = {
  placeId: string;
  name: string;
  formattedAddress: string;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  mapsUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  primaryType: string | null;
  /** Google's own "write a review" destination. Null when Google didn't return one. */
  writeAReviewUri: string | null;
};

function key() {
  const value = process.env["GOOGLE_MAPS_API_KEY"];
  if (!value) throw new Error("google_places_not_configured");
  return value;
}

function prettyType(type: string | null | undefined) {
  if (!type) return null;
  return type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export async function autocompleteBusinesses(
  input: string,
  sessionToken: string,
): Promise<PlaceSuggestion[]> {
  const res = await fetch(`${PLACES}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
    },
    body: JSON.stringify({
      input,
      sessionToken,
      includedPrimaryTypes: ["establishment"],
    }),
  });

  if (!res.ok) return [];
  const body = (await res.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
        types?: string[];
      };
    }>;
  };

  return (body.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .map((p) => ({
      placeId: p.placeId!,
      name: p.structuredFormat?.mainText?.text ?? "",
      address: p.structuredFormat?.secondaryText?.text ?? "",
      category: prettyType(p.types?.find((t) => t !== "establishment" && t !== "point_of_interest")),
    }))
    .slice(0, 6);
}

export async function placeDetails(placeId: string, sessionToken?: string): Promise<PlaceDetails | null> {
  const fields = [
    "id",
    "displayName",
    "formattedAddress",
    "addressComponents",
    "location",
    "nationalPhoneNumber",
    "websiteUri",
    "googleMapsUri",
    "rating",
    "userRatingCount",
    "businessStatus",
    "primaryTypeDisplayName",
    "primaryType",
    "googleMapsLinks",
  ].join(",");

  const url = new URL(`${PLACES}/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);

  const res = await fetch(url, {
    headers: { "X-Goog-Api-Key": key(), "X-Goog-FieldMask": fields },
  });
  if (!res.ok) return null;

  const p = (await res.json()) as {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
    location?: { latitude?: number; longitude?: number };
    nationalPhoneNumber?: string;
    websiteUri?: string;
    googleMapsUri?: string;
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
    primaryTypeDisplayName?: { text?: string };
    primaryType?: string;
    googleMapsLinks?: { writeAReviewUri?: string; reviewsUri?: string; placeUri?: string; directionsUri?: string };
  };

  const component = (type: string) =>
    p.addressComponents?.find((c) => c.types?.includes(type))?.longText ?? null;

  return {
    placeId: p.id ?? placeId,
    name: p.displayName?.text ?? "",
    formattedAddress: p.formattedAddress ?? "",
    city: component("locality") ?? component("postal_town"),
    region: component("administrative_area_level_1"),
    country: component("country"),
    latitude: p.location?.latitude ?? null,
    longitude: p.location?.longitude ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    mapsUri: p.googleMapsUri ?? null,
    rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? null,
    businessStatus: p.businessStatus ?? null,
    primaryType: p.primaryTypeDisplayName?.text ?? prettyType(p.primaryType),
    // Never invented locally: if Google doesn't return it, the caller must say so.
    writeAReviewUri: p.googleMapsLinks?.writeAReviewUri ?? null,
  };
}

/**
 * Legacy fallback only. The source of truth is googleMapsLinks.writeAReviewUri
 * from Place Details; this is used when Google returns no link at all, so a
 * plaque still lands on a review box rather than a guessed page.
 */
export function googleReviewUrl(placeId: string) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/** True for links that actually belong to Google (used to validate manual overrides). */
export function isGoogleUrl(raw: string) {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (
      host === "google.com" ||
      host.endsWith(".google.com") ||
      host === "maps.app.goo.gl" ||
      host === "g.page" ||
      host.endsWith(".g.page")
    );
  } catch {
    return false;
  }
}

export type PlaceSearchResult = {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  mapsUri: string | null;
  writeAReviewUri: string | null;
};

/**
 * Text search: unlike autocomplete this returns the rating and review count, so
 * the admin can confirm they picked the right listing before saving it.
 */
export async function searchBusinessesDetailed(query: string): Promise<PlaceSearchResult[]> {
  const res = await fetch(`${PLACES}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri,places.googleMapsLinks",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 8 }),
  });
  if (!res.ok) throw new Error(`google_places_search_failed_${res.status}`);
  const json = (await res.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      businessStatus?: string;
      googleMapsUri?: string;
      googleMapsLinks?: { writeAReviewUri?: string };
    }>;
  };
  return (json.places ?? [])
    .filter((p) => p.id)
    .map((p) => ({
      placeId: p.id!,
      name: p.displayName?.text ?? "Unnamed business",
      address: p.formattedAddress ?? "",
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
      businessStatus: p.businessStatus ?? null,
      mapsUri: p.googleMapsUri ?? null,
      writeAReviewUri: p.googleMapsLinks?.writeAReviewUri ?? null,
    }));
}
