/**
 * TapLocal AI attribution.
 *
 * Two strict halves, and they must never blur into each other:
 *
 *  - OBSERVED   TapLocal measured it in its own database (a tap, a redirect).
 *  - EXTERNAL   a permitted public source reported it (the Google listing).
 *  - INFERRED   AI believes two things may be related. Never a fact.
 *  - CONFIRMED  a direct integration proves it. Nothing here ever emits this.
 *
 * Nothing in this file identifies the physical visitor. A review author is a
 * PUBLIC contributor name published by Google; associating them with a tap is
 * always an estimate, never an identification.
 */

type AnyClient = { from: (table: string) => any };

export const PHOTO_STATUS = {
  main: "main_photo",
  cover: "cover_photo",
  top3: "top_3",
  top10: "top_10",
  gallery: "gallery_only",
  faded: "no_longer_prominent",
  absent: "not_detected",
  unverified: "needs_verification",
} as const;

export const PHOTO_STATUS_LABEL: Record<string, string> = {
  main_photo: "MAIN PHOTO",
  cover_photo: "COVER PHOTO",
  top_3: "TOP 3",
  top_10: "TOP 10",
  gallery_only: "GALLERY ONLY",
  no_longer_prominent: "NO LONGER PROMINENT",
  not_detected: "NOT DETECTED",
  needs_verification: "NEEDS VERIFICATION",
};

/** Prominence implied by the position Google itself returns the photo in. */
export function statusForRank(rank: number) {
  if (rank === 0) return PHOTO_STATUS.main;
  if (rank <= 2) return PHOTO_STATUS.top3;
  if (rank <= 9) return PHOTO_STATUS.top10;
  return PHOTO_STATUS.gallery;
}

const PROMINENT = new Set<string>([PHOTO_STATUS.main, PHOTO_STATUS.cover, PHOTO_STATUS.top3, PHOTO_STATUS.top10]);

/** Attribution window: results this far after a tap are worth considering at all. */
const WINDOW_MINUTES = 180;

/**
 * Pull the public listing signals for one business and record what changed.
 * Never writes a false negative: if Google can't be reached the existing
 * records are left alone and the caller is told the check didn't happen.
 */
export async function syncListingSignals(client: AnyClient, businessId: string) {
  const { data: location } = await client
    .from("locations")
    .select("id, google_place_id")
    .eq("business_id", businessId)
    .not("google_place_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!location?.google_place_id) {
    return { ok: false as const, reason: "no_google_listing" as const, newReviews: 0, photoChanges: 0 };
  }

  let signals;
  try {
    const { placeSignals } = await import("./google-places.server");
    signals = await placeSignals(location.google_place_id);
  } catch {
    return { ok: false as const, reason: "listing_unavailable" as const, newReviews: 0, photoChanges: 0 };
  }
  if (!signals.available) {
    return { ok: false as const, reason: "listing_unavailable" as const, newReviews: 0, photoChanges: 0 };
  }

  const now = new Date().toISOString();

  /* ---- reviews ------------------------------------------------------ */
  const { data: knownReviews } = await client
    .from("google_review_observations")
    .select("id, external_key")
    .eq("business_id", businessId);
  const knownKeys = new Set<string>((knownReviews ?? []).map((r: { external_key: string }) => r.external_key));

  let newReviews = 0;
  for (const r of signals.reviews) {
    const row = {
      business_id: businessId,
      location_id: location.id,
      google_place_id: location.google_place_id,
      external_key: r.key,
      author_name: r.authorName,
      author_profile_url: r.authorProfileUrl,
      author_photo_url: r.authorPhotoUrl,
      rating: r.rating,
      review_text: r.text,
      published_at: r.publishedAt,
      relative_time: r.relativeTime,
      checked_at: now,
      evidence: { source: "google_places_public" },
    };
    if (knownKeys.has(r.key)) {
      await client.from("google_review_observations").update(row).eq("business_id", businessId).eq("external_key", r.key);
    } else {
      await client.from("google_review_observations").insert({ ...row, first_seen_at: now });
      newReviews += 1;
    }
  }

  /* ---- photos ------------------------------------------------------- */
  const { data: knownPhotos } = await client
    .from("maps_photo_observations")
    .select("id, photo_ref, status")
    .eq("business_id", businessId);
  const knownByRef = new Map<string, { id: string; status: string }>(
    (knownPhotos ?? []).map((p: { id: string; photo_ref: string; status: string }) => [p.photo_ref, p]),
  );

  const { data: watch } = await client
    .from("contributor_watchlist")
    .select("id, business_id, display_name, contributor_id, active")
    .eq("active", true);
  const watched = (watch ?? []).filter(
    (w: { business_id: string | null }) => !w.business_id || w.business_id === businessId,
  );
  const matchWatch = (name: string | null, profileUrl: string | null) => {
    if (!name && !profileUrl) return null;
    return (
      watched.find(
        (w: { display_name: string; contributor_id: string | null }) =>
          (name && w.display_name.toLowerCase() === name.toLowerCase()) ||
          (w.contributor_id && profileUrl?.includes(w.contributor_id)),
      ) ?? null
    );
  };

  let photoChanges = 0;
  const seenRefs = new Set<string>();
  const gallerySize = signals.photos.length;

  for (const p of signals.photos) {
    seenRefs.add(p.ref);
    const status = statusForRank(p.rank);
    const existing = knownByRef.get(p.ref);
    const hit = matchWatch(p.authorName, p.authorProfileUrl);
    const base = {
      business_id: businessId,
      location_id: location.id,
      watchlist_id: hit?.id ?? null,
      contributor_name: p.authorName,
      contributor_id: hit?.contributor_id ?? null,
      photo_ref: p.ref,
      gallery_rank: p.rank,
      gallery_size: gallerySize,
      // The listing itself is the evidence, so this is high but never absolute.
      confidence: 90,
      verification_type: "places_api",
      evidence: {
        source: "google_places_public",
        author_profile_url: p.authorProfileUrl,
        note: "Position reported by Google. Google may promote photos automatically.",
      },
      checked_at: now,
    };

    if (!existing) {
      await client
        .from("maps_photo_observations")
        .insert({ ...base, status, status_changed_at: now, first_seen_at: now });
      photoChanges += 1;
    } else if (existing.status !== status) {
      await client
        .from("maps_photo_observations")
        .update({ ...base, status, previous_status: existing.status, status_changed_at: now })
        .eq("id", existing.id);
      photoChanges += 1;
    } else {
      await client.from("maps_photo_observations").update(base).eq("id", existing.id);
    }
  }

  // A photo Google no longer returns lost prominence — that is a real, separate fact.
  for (const [ref, existing] of knownByRef) {
    if (seenRefs.has(ref)) continue;
    const next = PROMINENT.has(existing.status) ? PHOTO_STATUS.faded : PHOTO_STATUS.absent;
    if (existing.status === next) continue;
    await client
      .from("maps_photo_observations")
      .update({
        status: next,
        previous_status: existing.status,
        status_changed_at: now,
        gallery_rank: null,
        checked_at: now,
        confidence: 70,
      })
      .eq("id", existing.id);
    photoChanges += 1;
  }

  return { ok: true as const, reason: null, newReviews, photoChanges, gallerySize };
}

/* ------------------------------------------------------------------ */
/* Scoring one interaction                                              */
/* ------------------------------------------------------------------ */

export type Candidate = {
  kind: string;
  badge: "OBSERVED" | "EXTERNAL" | "INFERRED" | "CONFIRMED";
  confidence: number;
  headline: string;
  detail: string | null;
  externalRef: string | null;
  occurredAt: string | null;
  evidence: {
    checks: Array<{ label: string; passed: boolean }>;
    minutesAfter?: number;
    competingInteractions?: number;
    note?: string;
  };
};

function minutesBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

/**
 * Bounded score. An inferred match can never read as certainty, so the ceiling
 * is 92% no matter how clean the evidence looks.
 */
function score(input: { minutesAfter: number; destinationMatches: boolean; competing: number }) {
  let value = 40;
  if (input.minutesAfter <= 15) value += 30;
  else if (input.minutesAfter <= 45) value += 22;
  else if (input.minutesAfter <= 90) value += 12;
  else value += 4;

  if (input.destinationMatches) value += 22;
  value -= Math.min(30, input.competing * 8);

  return Math.max(5, Math.min(92, Math.round(value)));
}

/**
 * Looks around one interaction for possible downstream results. Everything
 * returned is a CANDIDATE. Nothing here proves that this visitor did anything.
 */
export async function analyzeInteraction(client: AnyClient, eventId: string) {
  const { data: event } = await client
    .from("events")
    .select("id, business_id, plaque_id, location_id, source_type, destination_type, occurred_at, event_type")
    .eq("id", eventId)
    .maybeSingle();

  if (!event || event.event_type !== "interaction" || !event.business_id) {
    return { ok: false as const, candidates: [] as Candidate[] };
  }

  const tapAt: string = event.occurred_at;
  const windowEnd = new Date(new Date(tapAt).getTime() + WINDOW_MINUTES * 60000).toISOString();
  const candidates: Candidate[] = [];

  // How many other real taps at this business could explain the same result?
  const { data: competingRows } = await client
    .from("events")
    .select("id")
    .eq("business_id", event.business_id)
    .eq("event_type", "interaction")
    .gte("occurred_at", tapAt)
    .lte("occurred_at", windowEnd)
    .neq("id", event.id);
  const competing = (competingRows ?? []).length;

  /* ---- possible Google reviews -------------------------------------- */
  const { data: reviews } = await client
    .from("google_review_observations")
    .select("id, external_key, author_name, author_profile_url, rating, review_text, published_at, first_seen_at")
    .eq("business_id", event.business_id)
    .gte("published_at", tapAt)
    .lte("published_at", windowEnd);

  for (const r of reviews ?? []) {
    if (!r.published_at) continue;
    const minutesAfter = minutesBetween(tapAt, r.published_at);
    if (minutesAfter < 0) continue;
    const destinationMatches = event.destination_type === "google_review";
    const confidence = score({ minutesAfter, destinationMatches, competing });
    candidates.push({
      kind: "google_review",
      badge: "INFERRED",
      confidence,
      headline: `Possible Google review${r.author_name ? ` — ${r.author_name}` : ""}`,
      detail: r.review_text ? r.review_text.slice(0, 400) : null,
      externalRef: r.external_key,
      occurredAt: r.published_at,
      evidence: {
        checks: [
          { label: "Same business", passed: true },
          { label: "Destination was Google Reviews", passed: destinationMatches },
          { label: `Review appeared ${minutesAfter} minutes after the tap`, passed: minutesAfter <= 90 },
          { label: "No competing interaction in the window", passed: competing === 0 },
        ],
        minutesAfter,
        competingInteractions: competing,
        note: "Contributor names are published publicly by Google. TapLocal cannot identify the physical visitor.",
      },
    });
  }

  /* ---- possible customer photos / visibility changes ----------------- */
  const { data: photos } = await client
    .from("maps_photo_observations")
    .select("id, photo_ref, contributor_name, status, previous_status, gallery_rank, status_changed_at, first_seen_at")
    .eq("business_id", event.business_id)
    .gte("status_changed_at", tapAt)
    .lte("status_changed_at", windowEnd);

  for (const p of photos ?? []) {
    if (!p.status_changed_at) continue;
    const minutesAfter = minutesBetween(tapAt, p.status_changed_at);
    if (minutesAfter < 0) continue;
    const isNew = !p.previous_status;
    const destinationMatches = event.destination_type === "google_review";
    const confidence = score({ minutesAfter, destinationMatches, competing });
    candidates.push({
      kind: isNew ? "google_photo" : "photo_visibility",
      badge: "INFERRED",
      confidence,
      headline: isNew
        ? `Possible customer photo${p.contributor_name ? ` — ${p.contributor_name}` : ""}`
        : `Photo visibility changed to ${PHOTO_STATUS_LABEL[p.status] ?? p.status}`,
      detail: isNew
        ? "A new photo appeared on the public listing after this tap."
        : `Was ${PHOTO_STATUS_LABEL[p.previous_status ?? ""] ?? p.previous_status}, now ${PHOTO_STATUS_LABEL[p.status] ?? p.status}.`,
      externalRef: p.photo_ref,
      occurredAt: p.status_changed_at,
      evidence: {
        checks: [
          { label: "Same business", passed: true },
          { label: "Destination was Google Reviews", passed: destinationMatches },
          { label: `Detected ${minutesAfter} minutes after the tap`, passed: minutesAfter <= 90 },
          { label: "No competing interaction in the window", passed: competing === 0 },
        ],
        minutesAfter,
        competingInteractions: competing,
        note: "Google may promote photos automatically. This is not proof the contributor chose the main image.",
      },
    });
  }

  /* ---- measured conversions we own ----------------------------------- */
  const { data: outcomes } = await client
    .from("outcomes")
    .select("id, outcome_type, value, occurred_at, attribution_type")
    .eq("business_id", event.business_id)
    .gte("occurred_at", tapAt)
    .lte("occurred_at", windowEnd);

  for (const o of outcomes ?? []) {
    const minutesAfter = minutesBetween(tapAt, o.occurred_at);
    candidates.push({
      kind: `outcome_${o.outcome_type}`,
      badge: o.attribution_type === "direct" ? "OBSERVED" : "INFERRED",
      confidence: o.attribution_type === "direct" ? 100 : score({ minutesAfter, destinationMatches: true, competing }),
      headline: `${o.outcome_type.replace(/_/g, " ")} recorded`,
      detail: typeof o.value === "number" ? `Value ${o.value}` : null,
      externalRef: o.id,
      occurredAt: o.occurred_at,
      evidence: {
        checks: [
          { label: "Same business", passed: true },
          { label: `Recorded ${minutesAfter} minutes after the tap`, passed: minutesAfter <= 90 },
        ],
        minutesAfter,
        competingInteractions: competing,
      },
    });
  }

  /* ---- inquiries ----------------------------------------------------- */
  const { data: inquiries } = await client
    .from("offering_inquiries")
    .select("id, name, created_at")
    .eq("business_id", event.business_id)
    .gte("created_at", tapAt)
    .lte("created_at", windowEnd);

  for (const q of inquiries ?? []) {
    const minutesAfter = minutesBetween(tapAt, q.created_at);
    candidates.push({
      kind: "inquiry",
      badge: "OBSERVED",
      confidence: 100,
      headline: "Enquiry received",
      detail: q.name ? `From ${q.name}` : null,
      externalRef: q.id,
      occurredAt: q.created_at,
      evidence: {
        checks: [
          { label: "Same business", passed: true },
          { label: `Submitted ${minutesAfter} minutes after the tap`, passed: true },
        ],
        minutesAfter,
      },
    });
  }

  // Persist so the same tap keeps a stable, auditable analysis. Rewritten in
  // full each run: the evidence is only ever as good as the latest check.
  await client.from("attribution_candidates").delete().eq("event_id", event.id).eq("status", "open");
  if (candidates.length) {
    await client.from("attribution_candidates").insert(
      candidates.map((c) => ({
        event_id: event.id,
        business_id: event.business_id,
        plaque_id: event.plaque_id,
        kind: c.kind,
        badge: c.badge,
        confidence: c.confidence,
        headline: c.headline,
        detail: c.detail,
        evidence: c.evidence,
        external_ref: c.externalRef,
        occurred_at: c.occurredAt,
      })),
    );
  }

  return { ok: true as const, candidates: candidates.sort((a, b) => b.confidence - a.confidence) };
}
