import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Google Maps photo visibility and contributor monitoring.
 *
 * Four separate facts, never merged into one: a contributor uploaded a photo,
 * a photo exists in the gallery, a photo is in the top 3 / top 10, and a photo
 * is currently the main image. Every record carries how it was verified and
 * when it was last checked. Nothing is ever invented — a failed check records
 * NEEDS VERIFICATION rather than a false negative.
 */

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Watched contributors: the platform-wide list plus any business-specific ones. */
export const listWatchlist = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ businessId: z.string().uuid().nullable().default(null) }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, entries: [] };
    const client = await db();

    const { data: rows } = await client
      .from("contributor_watchlist")
      .select("id, business_id, display_name, contributor_id, profile_url, notes, active, created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    const entries = (rows ?? []).filter((r) => !data.businessId || !r.business_id || r.business_id === data.businessId);
    const bizIds = [...new Set(entries.map((e) => e.business_id).filter(Boolean))] as string[];
    const { data: businesses } = bizIds.length
      ? await client.from("businesses").select("id, name").in("id", bizIds)
      : { data: [] };
    const bizName = new Map((businesses ?? []).map((b) => [b.id, b.name]));

    return {
      ok: true as const,
      entries: entries.map((e) => ({
        ...e,
        scope: e.business_id ? (bizName.get(e.business_id) ?? "One business") : "Platform-wide",
      })),
    };
  });

export const saveWatchedContributor = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().default(null),
        businessId: z.string().uuid().nullable().default(null),
        displayName: z.string().min(1).max(120),
        contributorId: z.string().max(120).nullable().default(null),
        profileUrl: z.string().max(500).nullable().default(null),
        notes: z.string().max(500).nullable().default(null),
        active: z.boolean().default(true),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();

    const row = {
      business_id: data.businessId,
      display_name: data.displayName.trim(),
      contributor_id: data.contributorId?.trim() || null,
      profile_url: data.profileUrl?.trim() || null,
      notes: data.notes?.trim() || null,
      active: data.active,
      created_by_user_id: caller.userId,
    };

    if (data.id) {
      const { error } = await client.from("contributor_watchlist").update(row).eq("id", data.id);
      if (error) return { ok: false as const, error: "save_failed" as const };
      return { ok: true as const, id: data.id };
    }

    const { data: created, error } = await client.from("contributor_watchlist").insert(row).select("id").single();
    if (error || !created) return { ok: false as const, error: "save_failed" as const };
    return { ok: true as const, id: created.id };
  });

export const removeWatchedContributor = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();
    await client.from("contributor_watchlist").delete().eq("id", data.id);
    return { ok: true as const };
  });

/** Re-read one business's public listing and record what changed. */
export const checkListing = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ businessId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, result: null };
    const client = await db();
    const { syncListingSignals } = await import("@/lib/attribution.server");
    const result = await syncListingSignals(client as never, data.businessId);
    return { ok: true as const, result };
  });

/** Photo visibility, review sightings and recent alerts across the network. */
export const photoVisibilityOverview = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ businessId: z.string().uuid().nullable().default(null) }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, photos: [], reviews: [], alerts: [] };
    const client = await db();
    const { getDemoScope } = await import("@/lib/admin-scope.server");
    const scope = await getDemoScope(client as never);

    let photoQuery = client
      .from("maps_photo_observations")
      .select(
        "id, business_id, contributor_name, contributor_id, photo_ref, status, previous_status, gallery_rank, gallery_size, confidence, verification_type, checked_at, status_changed_at, first_seen_at, watchlist_id",
      )
      .order("gallery_rank", { ascending: true, nullsFirst: false })
      .limit(400);
    let reviewQuery = client
      .from("google_review_observations")
      .select("id, business_id, author_name, author_profile_url, rating, review_text, published_at, first_seen_at")
      .order("published_at", { ascending: false })
      .limit(100);

    if (data.businessId) {
      photoQuery = photoQuery.eq("business_id", data.businessId);
      reviewQuery = reviewQuery.eq("business_id", data.businessId);
    }

    const [{ data: photos }, { data: reviews }] = await Promise.all([photoQuery, reviewQuery]);
    const realPhotos = (photos ?? []).filter((p) => !scope.isDemoRow(p));
    const realReviews = (reviews ?? []).filter((r) => !scope.isDemoRow(r));

    const bizIds = [
      ...new Set([...realPhotos.map((p) => p.business_id), ...realReviews.map((r) => r.business_id)].filter(Boolean)),
    ] as string[];
    const { data: businesses } = bizIds.length
      ? await client.from("businesses").select("id, name").in("id", bizIds)
      : { data: [] };
    const bizName = new Map((businesses ?? []).map((b) => [b.id, b.name]));

    const alerts = realPhotos
      .filter((p) => p.status_changed_at)
      .sort((a, b) => (a.status_changed_at! < b.status_changed_at! ? 1 : -1))
      .slice(0, 20)
      .map((p) => ({
        id: p.id,
        businessId: p.business_id,
        business: bizName.get(p.business_id) ?? "Unknown",
        contributor: p.contributor_name,
        from: p.previous_status,
        to: p.status,
        at: p.status_changed_at,
        watched: Boolean(p.watchlist_id),
      }));

    return {
      ok: true as const,
      photos: realPhotos.map((p) => ({ ...p, business: bizName.get(p.business_id) ?? "Unknown" })),
      reviews: realReviews.map((r) => ({ ...r, business: bizName.get(r.business_id) ?? "Unknown" })),
      alerts,
    };
  });

/**
 * Gallery photo bytes as a data URL, fetched server-side so the Google key
 * never reaches the browser. Same-origin data means the admin screen can
 * fingerprint the image on a canvas.
 */
export const fetchGalleryPhoto = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ ref: z.string().min(4).max(500) }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, dataUrl: null };
    try {
      const { photoMediaUrl } = await import("@/lib/google-places.server");
      const res = await fetch(photoMediaUrl(data.ref, 320), { redirect: "follow" });
      if (!res.ok) return { ok: false as const, error: "unavailable" as const, dataUrl: null };
      const buffer = new Uint8Array(await res.arrayBuffer());
      let binary = "";
      for (const byte of buffer) binary += String.fromCharCode(byte);
      const mime = res.headers.get("content-type") ?? "image/jpeg";
      return { ok: true as const, dataUrl: `data:${mime};base64,${btoa(binary)}` };
    } catch {
      return { ok: false as const, error: "unavailable" as const, dataUrl: null };
    }
  });

/** Store the fingerprint the admin screen computed for a known gallery photo. */
export const saveObservationFingerprint = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ observationId: z.string().uuid(), hash: z.string().min(8).max(128) }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();
    await client.from("maps_photo_observations").update({ perceptual_hash: data.hash }).eq("id", data.observationId);
    return { ok: true as const };
  });

function hamming(a: string, b: string) {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    distance += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
  }
  return distance;
}

/**
 * Screenshot / screen-recording frame scanner. The fingerprint is computed in
 * the browser and compared here against every known gallery photo, so the same
 * image still matches after cropping, resizing or recompression.
 */
export const scanEvidenceUpload = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        businessId: z.string().uuid().nullable().default(null),
        kind: z.enum(["screenshot", "screen_recording"]).default("screenshot"),
        hash: z.string().min(8).max(128),
        thumbnail: z.string().max(400000).nullable().default(null),
        note: z.string().max(500).nullable().default(null),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, match: null };
    const client = await db();

    let query = client
      .from("maps_photo_observations")
      .select("id, business_id, contributor_name, status, gallery_rank, perceptual_hash")
      .not("perceptual_hash", "is", null)
      .limit(2000);
    if (data.businessId) query = query.eq("business_id", data.businessId);
    const { data: known } = await query;
    type KnownPhoto = NonNullable<typeof known>[number];

    let best: { id: string; distance: number; row: KnownPhoto } | null = null;
    for (const row of known ?? []) {
      const distance = hamming(data.hash, row.perceptual_hash!);
      if (!best || distance < best.distance) best = { id: row.id, distance, row };
    }

    // 10 bits out of 64 is the usual crop/resize tolerance for this fingerprint.
    const matched = best && best.distance <= 10 ? best : null;

    const { data: upload } = await client
      .from("evidence_uploads")
      .insert({
        business_id: data.businessId ?? matched?.row.business_id ?? null,
        observation_id: matched?.id ?? null,
        kind: data.kind,
        perceptual_hash: data.hash,
        thumbnail: data.thumbnail,
        match_distance: matched?.distance ?? null,
        note: data.note,
        extracted: { matched: Boolean(matched) },
        uploaded_by_user_id: caller.userId,
      })
      .select("id")
      .single();

    if (matched) {
      await client
        .from("maps_photo_observations")
        .update({
          verification_type: data.kind === "screen_recording" ? "screen_recording" : "screenshot",
          confidence: 95,
          checked_at: new Date().toISOString(),
        })
        .eq("id", matched.id);
    }

    return {
      ok: true as const,
      uploadId: upload?.id ?? null,
      match: matched
        ? {
            observationId: matched.id,
            distance: matched.distance,
            contributor: matched.row.contributor_name,
            status: matched.row.status,
            galleryRank: matched.row.gallery_rank,
          }
        : null,
    };
  });

/** Manual staff verification when no automated check can settle it. */
export const setObservationStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        observationId: z.string().uuid(),
        status: z.enum([
          "main_photo",
          "cover_photo",
          "top_3",
          "top_10",
          "gallery_only",
          "no_longer_prominent",
          "not_detected",
          "needs_verification",
        ]),
        note: z.string().max(400).nullable().default(null),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();
    const now = new Date().toISOString();

    const { data: existing } = await client
      .from("maps_photo_observations")
      .select("status")
      .eq("id", data.observationId)
      .maybeSingle();

    await client
      .from("maps_photo_observations")
      .update({
        status: data.status,
        previous_status: existing?.status ?? null,
        ...(existing?.status === data.status ? {} : { status_changed_at: now }),
        verification_type: "manual",
        confidence: 100,
        checked_at: now,
        evidence: { source: "taplocal_staff_verification", note: data.note, verified_by: caller.userId },
      })
      .eq("id", data.observationId);

    return { ok: true as const };
  });
