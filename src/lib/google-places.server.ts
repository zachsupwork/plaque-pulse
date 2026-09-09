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

/* ------------------------------------------------------------------ */
/* Public listing signals: reviews and gallery photos                   */
/* ------------------------------------------------------------------ */

export type PublicReview = {
  /** Stable-ish key for deduplication across polls. */
  key: string;
  authorName: string | null;
  authorProfileUrl: string | null;
  authorPhotoUrl: string | null;
  rating: number | null;
  text: string | null;
  publishedAt: string | null;
  relativeTime: string | null;
};

export type PublicPhoto = {
  /** Google photo resource name — used as the stable reference. */
  ref: string;
  /** Position in the gallery Google returns; 0 is the most prominent. */
  rank: number;
  authorName: string | null;
  authorProfileUrl: string | null;
  widthPx: number | null;
  heightPx: number | null;
};

/**
 * Reads the PUBLIC listing signals Places (New) is permitted to return:
 * up to five recent reviews and the gallery photo list in Google's own order.
 * Google is never scraped, and nothing here is invented — a field Google
 * omits comes back as null so callers can say "not available".
 */
export async function placeSignals(
  placeId: string,
): Promise<{ reviews: PublicReview[]; photos: PublicPhoto[]; available: boolean }> {
  const res = await fetch(`${PLACES}/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask": "id,reviews,photos",
    },
  });
  if (!res.ok) return { reviews: [], photos: [], available: false };

  const body = (await res.json()) as {
    reviews?: Array<{
      name?: string;
      rating?: number;
      text?: { text?: string };
      originalText?: { text?: string };
      publishTime?: string;
      relativePublishTimeDescription?: string;
      authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
    }>;
    photos?: Array<{
      name?: string;
      widthPx?: number;
      heightPx?: number;
      authorAttributions?: Array<{ displayName?: string; uri?: string }>;
    }>;
  };

  const reviews: PublicReview[] = (body.reviews ?? []).map((r, i) => ({
    key: r.name ?? `${placeId}:${r.publishTime ?? i}`,
    authorName: r.authorAttribution?.displayName ?? null,
    authorProfileUrl: r.authorAttribution?.uri ?? null,
    authorPhotoUrl: r.authorAttribution?.photoUri ?? null,
    rating: typeof r.rating === "number" ? r.rating : null,
    text: r.text?.text ?? r.originalText?.text ?? null,
    publishedAt: r.publishTime ?? null,
    relativeTime: r.relativePublishTimeDescription ?? null,
  }));

  const photos: PublicPhoto[] = (body.photos ?? [])
    .filter((p) => p.name)
    .map((p, i) => ({
      ref: p.name!,
      rank: i,
      authorName: p.authorAttributions?.[0]?.displayName ?? null,
      authorProfileUrl: p.authorAttributions?.[0]?.uri ?? null,
      widthPx: p.widthPx ?? null,
      heightPx: p.heightPx ?? null,
    }));

  return { reviews, photos, available: true };
}

/** Media URL for a gallery photo resource name. Server-side only (carries the key). */
export function photoMediaUrl(ref: string, maxWidthPx = 640) {
  return `${PLACES}/${ref}/media?maxWidthPx=${maxWidthPx}&key=${encodeURIComponent(key())}`;
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

/* ------------------------------------------------------------------ */
/* Bulk area discovery                                                  */
/* ------------------------------------------------------------------ */

export type AreaPlace = {
  placeId: string;
  name: string;
  address: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  mapsUri: string | null;
  writeAReviewUri: string | null;
  website: string | null;
};

export type AreaCategory =
  | "food"
  | "restaurants"
  | "cafes"
  | "bars"
  | "retail"
  | "beauty"
  | "fitness"
  | "professional"
  | "all";

/**
 * Category-focused query terms. Several narrow searches return far more of a
 * street than one broad search, and Google Place ID deduplication merges them.
 */
const CATEGORY_TERMS: Record<AreaCategory, string[]> = {
  food: ["restaurants", "cafes", "coffee shops", "bars", "pubs", "bakeries", "takeout", "food"],
  restaurants: ["restaurants", "dining", "takeout"],
  cafes: ["cafes", "coffee shops", "bakeries"],
  bars: ["bars", "pubs", "breweries", "cocktail bars"],
  retail: ["shops", "stores", "boutiques", "convenience stores"],
  beauty: ["hair salons", "barbers", "nail salons", "spas"],
  fitness: ["gyms", "fitness studios", "yoga studios"],
  professional: ["dentists", "clinics", "law offices", "real estate offices", "accountants"],
  all: ["businesses", "restaurants", "cafes", "shops", "services"],
};

const AREA_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.googleMapsLinks",
  "places.primaryTypeDisplayName",
  "places.primaryType",
  "places.websiteUri",
  "nextPageToken",
].join(",");

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: Array<{ longText?: string; types?: string[] }>;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  googleMapsUri?: string;
  googleMapsLinks?: { writeAReviewUri?: string };
  primaryTypeDisplayName?: { text?: string };
  primaryType?: string;
  websiteUri?: string;
};

function toAreaPlace(p: RawPlace): AreaPlace {
  const city =
    p.addressComponents?.find((c) => c.types?.includes("locality"))?.longText ??
    p.addressComponents?.find((c) => c.types?.includes("postal_town"))?.longText ??
    null;
  return {
    placeId: p.id!,
    name: p.displayName?.text ?? "Unnamed business",
    address: p.formattedAddress ?? "",
    city,
    latitude: p.location?.latitude ?? null,
    longitude: p.location?.longitude ?? null,
    category: p.primaryTypeDisplayName?.text ?? prettyType(p.primaryType),
    rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? null,
    businessStatus: p.businessStatus ?? null,
    mapsUri: p.googleMapsUri ?? null,
    writeAReviewUri: p.googleMapsLinks?.writeAReviewUri ?? null,
    website: p.websiteUri ?? null,
  };
}

/** One Text Search page. Returns the results plus Google's next page token. */
async function textSearchPage(textQuery: string, pageToken?: string) {
  const res = await fetch(`${PLACES}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask": AREA_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
  });
  if (!res.ok) return { places: [] as AreaPlace[], nextPageToken: undefined as string | undefined };
  const json = (await res.json()) as { places?: RawPlace[]; nextPageToken?: string };
  return {
    places: (json.places ?? []).filter((p) => p.id).map(toAreaPlace),
    nextPageToken: json.nextPageToken,
  };
}

/**
 * Bulk street/neighbourhood discovery. Runs several compliant Text Search
 * queries (paged) and merges them, deduplicating strictly by Google Place ID.
 * Nothing is invented and no Google page is ever scraped.
 */
export async function discoverBusinessesInArea(input: {
  query: string;
  category?: AreaCategory;
  maxResults?: number;
}): Promise<AreaPlace[]> {
  const category = input.category ?? "food";
  const max = Math.min(input.maxResults ?? 120, 200);
  const area = input.query.trim();
  const terms = CATEGORY_TERMS[category] ?? CATEGORY_TERMS.food;
  const queries = [area, ...terms.map((t) => `${t} on ${area}`)];

  const byPlaceId = new Map<string, AreaPlace>();

  for (const q of queries) {
    if (byPlaceId.size >= max) break;
    let token: string | undefined;
    for (let page = 0; page < 3; page += 1) {
      let result;
      try {
        result = await textSearchPage(q, token);
      } catch {
        break;
      }
      for (const place of result.places) {
        if (!byPlaceId.has(place.placeId)) byPlaceId.set(place.placeId, place);
      }
      token = result.nextPageToken;
      if (!token || byPlaceId.size >= max) break;
    }
  }

  return [...byPlaceId.values()].slice(0, max);
}
