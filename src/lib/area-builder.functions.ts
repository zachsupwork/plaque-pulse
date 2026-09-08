import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nfcUrl, qrUrl } from "@/lib/smartlink";

/**
 * Area Builder: bulk street/neighbourhood discovery and preparation.
 *
 * Everything here is admin-gated and runs server-side. Businesses are
 * deduplicated by Google Place ID and plaques keep the same permanent
 * identity model as every other TapLocal plaque.
 */

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const AREA_CATEGORIES = [
  { value: "food", label: "Restaurants, cafés & bars" },
  { value: "restaurants", label: "Restaurants" },
  { value: "cafes", label: "Cafés & bakeries" },
  { value: "bars", label: "Bars & pubs" },
  { value: "retail", label: "Retail" },
  { value: "beauty", label: "Beauty" },
  { value: "fitness", label: "Fitness" },
  { value: "professional", label: "Professional services" },
  { value: "all", label: "All businesses" },
] as const;

export const PROSPECT_STATUSES = [
  { value: "not_visited", label: "Not visited" },
  { value: "interested", label: "Interested" },
  { value: "accepted", label: "Accepted" },
  { value: "follow_up", label: "Follow up" },
  { value: "declined", label: "Declined" },
  { value: "installed", label: "Installed" },
  { value: "existing_customer", label: "Existing customer" },
] as const;

const categoryEnum = z.enum([
  "food",
  "restaurants",
  "cafes",
  "bars",
  "retail",
  "beauty",
  "fitness",
  "professional",
  "all",
]);

/** Bulk area search, annotated with what TapLocal already holds. */
export const discoverArea = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        query: z.string().min(3).max(160),
        category: categoryEnum.default("food"),
        maxResults: z.number().int().min(10).max(200).default(120),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, places: [] };

    const { allowRequest } = await import("./activation-guard.server");
    if (!(await allowRequest(`area-search-${caller.userId}`, 60))) {
      return { ok: false as const, error: "rate_limited" as const, places: [] };
    }

    const { discoverBusinessesInArea } = await import("./google-places.server");
    let places;
    try {
      places = await discoverBusinessesInArea({
        query: data.query,
        category: data.category,
        maxResults: data.maxResults,
      });
    } catch (err) {
      const notConfigured = err instanceof Error && err.message === "google_places_not_configured";
      return { ok: false as const, error: notConfigured ? ("not_configured" as const) : ("failed" as const), places: [] };
    }

    const client = await db();
    const ids = places.map((p) => p.placeId);
    const existingLocations = ids.length
      ? (await client.from("locations").select("id, business_id, google_place_id").in("google_place_id", ids)).data ?? []
      : [];
    const businessIds = [...new Set(existingLocations.map((l) => l.business_id))];
    const existingPlaques = businessIds.length
      ? (await client.from("plaques").select("id, business_id").in("business_id", businessIds)).data ?? []
      : [];

    return {
      ok: true as const,
      error: null,
      places: places.map((p) => {
        const match = existingLocations.find((l) => l.google_place_id === p.placeId);
        return {
          ...p,
          existingBusinessId: match?.business_id ?? null,
          existingPlaqueCount: match ? existingPlaques.filter((q) => q.business_id === match.business_id).length : 0,
        };
      }),
    };
  });

const placeInput = z.object({
  placeId: z.string().min(4).max(300),
  name: z.string().min(1).max(200),
  address: z.string().max(300).nullish(),
  city: z.string().max(120).nullish(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  category: z.string().max(120).nullish(),
  rating: z.number().nullish(),
  reviewCount: z.number().nullish(),
  businessStatus: z.string().max(60).nullish(),
  mapsUri: z.string().max(600).nullish(),
  writeAReviewUri: z.string().max(900).nullish(),
  website: z.string().max(600).nullish(),
});

/**
 * Create (or reopen) a named batch and store the selected places as prospects.
 * Idempotent: re-running with the same batch code updates the same rows rather
 * than duplicating anything.
 */
export const createAreaBatch = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        batchCode: z
          .string()
          .min(3)
          .max(40)
          .regex(/^[A-Za-z0-9-_]+$/, "Use letters, numbers and dashes"),
        name: z.string().min(2).max(120),
        areaQuery: z.string().min(2).max(160),
        category: categoryEnum.default("food"),
        designType: z.enum(["generic", "branded"]).default("generic"),
        plaquesPerPlace: z.number().int().min(1).max(3).default(1),
        mode: z.enum(["prospects", "plaques"]).default("prospects"),
        places: z.array(placeInput).min(1).max(200),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, batchId: null };
    const client = await db();

    const code = data.batchCode.toUpperCase();
    const { data: existing } = await client.from("area_batches").select("id").eq("batch_code", code).maybeSingle();

    let batchId = existing?.id ?? null;
    if (batchId) {
      await client
        .from("area_batches")
        .update({
          name: data.name,
          area_query: data.areaQuery,
          category: data.category,
          design_type: data.designType,
          plaques_per_place: data.plaquesPerPlace,
          mode: data.mode,
        })
        .eq("id", batchId);
    } else {
      const { data: created, error } = await client
        .from("area_batches")
        .insert({
          batch_code: code,
          name: data.name,
          area_query: data.areaQuery,
          category: data.category,
          design_type: data.designType,
          plaques_per_place: data.plaquesPerPlace,
          mode: data.mode,
          created_by_user_id: caller.userId,
        })
        .select("id")
        .single();
      if (error || !created) return { ok: false as const, error: "failed" as const, batchId: null };
      batchId = created.id;
    }

    const { data: already } = await client
      .from("area_prospects")
      .select("google_place_id, position")
      .eq("batch_id", batchId);
    const seen = new Set((already ?? []).map((p) => p.google_place_id));
    let position = (already ?? []).reduce((max, p) => Math.max(max, p.position), 0);

    const rows = data.places
      .filter((p) => !seen.has(p.placeId))
      .map((p) => {
        position += 1;
        return {
          batch_id: batchId,
          position,
          google_place_id: p.placeId,
          name: p.name,
          address: p.address ?? null,
          city: p.city ?? null,
          latitude: p.latitude ?? null,
          longitude: p.longitude ?? null,
          category: p.category ?? null,
          rating: p.rating ?? null,
          review_count: p.reviewCount ?? null,
          business_status: p.businessStatus ?? null,
          maps_uri: p.mapsUri ?? null,
          review_url: p.writeAReviewUri ?? null,
          website: p.website ?? null,
        };
      });

    if (rows.length) await client.from("area_prospects").insert(rows as never);

    return { ok: true as const, error: null, batchId, batchCode: code, added: rows.length, reused: seen.size };
  });

/**
 * Process a slice of a batch: create/reuse the business, then mint plaques when
 * the batch is in plaque mode. Chunked so a large street never times out, and
 * safe to re-run — completed prospects are skipped.
 */
export const processAreaChunk = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ batchId: z.string().uuid(), limit: z.number().int().min(1).max(5).default(3) }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, processed: 0, remaining: 0, failed: 0 };
    const client = await db();

    const { data: batch } = await client.from("area_batches").select("*").eq("id", data.batchId).maybeSingle();
    if (!batch) return { ok: false as const, error: "not_found" as const, processed: 0, remaining: 0, failed: 0 };

    const wantPlaques = batch.mode === "plaques" ? batch.plaques_per_place : 0;

    const { data: pending } = await client
      .from("area_prospects")
      .select("*")
      .eq("batch_id", data.batchId)
      .order("position", { ascending: true });

    const todo = (pending ?? []).filter(
      (p) => !p.business_id || (wantPlaques > 0 && p.plaques_created < wantPlaques),
    );
    const slice = todo.slice(0, data.limit);

    const {
      ensureBusinessFromPlace,
      createPlaqueForBusiness,
      setInitialGoogleReviewDestination,
    } = await import("@/lib/area-builder.server");
    const { googleReviewUrl } = await import("@/lib/google-places.server");

    let failed = 0;
    for (const prospect of slice) {
      try {
        let businessId = prospect.business_id as string | null;
        let locationId = prospect.location_id as string | null;
        let reviewUrl = prospect.review_url as string | null;

        if (!businessId) {
          const ensured = await ensureBusinessFromPlace(client as never, prospect.google_place_id, caller.userId);
          if (!ensured) {
            failed += 1;
            await client.from("area_prospects").update({ error: "google_lookup_failed" }).eq("id", prospect.id);
            continue;
          }
          businessId = ensured.businessId;
          locationId = ensured.locationId;
          reviewUrl = ensured.reviewUrl ?? reviewUrl;
          await client
            .from("area_prospects")
            .update({
              business_id: businessId,
              location_id: locationId,
              review_url: reviewUrl,
              website: ensured.website ?? prospect.website,
              error: null,
              status: ensured.reused && prospect.status === "not_visited" ? "existing_customer" : prospect.status,
            })
            .eq("id", prospect.id);
        }

        let made = prospect.plaques_created as number;
        while (made < wantPlaques) {
          const plaque = await createPlaqueForBusiness(client as never, {
            businessId: businessId!,
            locationId,
            batchCode: batch.batch_code,
            userId: caller.userId,
          });
          if (!plaque) break;
          await setInitialGoogleReviewDestination(client as never, {
            businessId: businessId!,
            plaqueId: plaque.id,
            url: reviewUrl || googleReviewUrl(prospect.google_place_id),
          });
          made += 1;
          await client.from("area_prospects").update({ plaques_created: made }).eq("id", prospect.id);
        }
        if (made < wantPlaques) failed += 1;
      } catch {
        failed += 1;
        await client.from("area_prospects").update({ error: "preparation_failed" }).eq("id", prospect.id);
      }
    }

    return {
      ok: true as const,
      error: null,
      processed: slice.length,
      remaining: Math.max(0, todo.length - slice.length),
      failed,
    };
  });

/** All area batches, newest first. */
export const listAreaBatches = createServerFn({ method: "GET" }).handler(async () => {
  const caller = await gate();
  if (!caller.ok) return { ok: false as const, error: caller.error, batches: [] };
  const client = await db();

  const { data: batches } = await client
    .from("area_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(60);
  const ids = (batches ?? []).map((b) => b.id);
  const { data: prospects } = ids.length
    ? await client.from("area_prospects").select("batch_id, status, plaques_created").in("batch_id", ids)
    : { data: [] as Array<{ batch_id: string; status: string; plaques_created: number }> };

  return {
    ok: true as const,
    error: null,
    batches: (batches ?? []).map((b) => {
      const rows = (prospects ?? []).filter((p) => p.batch_id === b.id);
      return {
        id: b.id,
        batchCode: b.batch_code,
        name: b.name,
        areaQuery: b.area_query,
        mode: b.mode,
        designType: b.design_type,
        createdAt: b.created_at,
        places: rows.length,
        plaques: rows.reduce((sum, r) => sum + (r.plaques_created ?? 0), 0),
        accepted: rows.filter((r) => r.status === "accepted" || r.status === "installed").length,
      };
    }),
  };
});

/** Full batch with every prospect, its plaques and their links. */
export const areaBatchDetail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ batchId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, batch: null, rows: [] };
    const client = await db();

    const { data: batch } = await client.from("area_batches").select("*").eq("id", data.batchId).maybeSingle();
    if (!batch) return { ok: false as const, error: "not_found" as const, batch: null, rows: [] };

    const { data: prospects } = await client
      .from("area_prospects")
      .select("*")
      .eq("batch_id", batch.id)
      .order("position", { ascending: true });

    const businessIds = (prospects ?? []).map((p) => p.business_id).filter(Boolean) as string[];
    const { data: plaques } = businessIds.length
      ? await client
          .from("plaques")
          .select("id, plaque_code, public_slug, business_id, status, placement_type, batch_id")
          .in("business_id", businessIds)
          .eq("batch_id", batch.batch_code)
      : { data: [] as never[] };

    const plaqueIds = (plaques ?? []).map((p) => p.id);
    const { data: programming } = plaqueIds.length
      ? await client
          .from("plaque_programming")
          .select("plaque_id, write_status, verification_status")
          .in("plaque_id", plaqueIds)
      : { data: [] as never[] };
    const { data: destinations } = plaqueIds.length
      ? await client
          .from("destinations")
          .select("plaque_id, destination_type, url")
          .in("plaque_id", plaqueIds)
          .is("effective_to", null)
      : { data: [] as never[] };

    return {
      ok: true as const,
      error: null,
      batch: {
        id: batch.id,
        batchCode: batch.batch_code,
        name: batch.name,
        areaQuery: batch.area_query,
        category: batch.category,
        mode: batch.mode,
        designType: batch.design_type,
        plaquesPerPlace: batch.plaques_per_place,
        createdAt: batch.created_at,
      },
      rows: (prospects ?? []).map((p) => {
        const mine = (plaques ?? []).filter((q) => q.business_id === p.business_id);
        return {
          id: p.id,
          position: p.position,
          name: p.name,
          address: p.address,
          city: p.city,
          category: p.category,
          rating: p.rating,
          reviewCount: p.review_count,
          googlePlaceId: p.google_place_id,
          mapsUri: p.maps_uri,
          reviewUrl: p.review_url,
          website: p.website,
          instagram: p.instagram,
          businessId: p.business_id,
          status: p.status,
          notes: p.notes,
          error: p.error,
          plaques: mine.map((q) => {
            const prog = (programming ?? []).find((r) => r.plaque_id === q.id);
            const dest = (destinations ?? []).find((r) => r.plaque_id === q.id);
            return {
              id: q.id,
              plaqueCode: q.plaque_code,
              slug: q.public_slug,
              nfcUrl: nfcUrl(q.public_slug),
              qrUrl: qrUrl(q.public_slug),
              status: q.status,
              placement: q.placement_type,
              writeStatus: prog?.write_status ?? "not_programmed",
              verificationStatus: prog?.verification_status ?? "not_verified",
              destinationType: dest?.destination_type ?? null,
              destinationUrl: dest?.url ?? null,
            };
          }),
        };
      }),
    };
  });

/** Canvassing status for one prospect. History is never deleted. */
export const setProspectStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        prospectId: z.string().uuid(),
        status: z.enum([
          "not_visited",
          "interested",
          "accepted",
          "follow_up",
          "declined",
          "installed",
          "existing_customer",
        ]),
        notes: z.string().max(600).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();
    await client
      .from("area_prospects")
      .update({ status: data.status, ...(data.notes === undefined ? {} : { notes: data.notes }) })
      .eq("id", data.prospectId);
    return { ok: true as const, error: null };
  });

/** Background research: fill in website and Instagram for one prospect. */
export const researchProspect = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ prospectId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, website: null, instagram: null };
    const client = await db();

    const { data: prospect } = await client
      .from("area_prospects")
      .select("id, name, address, city, website, business_id, location_id, google_place_id")
      .eq("id", data.prospectId)
      .maybeSingle();
    if (!prospect) return { ok: false as const, error: "not_found" as const, website: null, instagram: null };

    let website = prospect.website as string | null;
    if (!website) {
      const { placeDetails } = await import("./google-places.server");
      website = (await placeDetails(prospect.google_place_id))?.website ?? null;
    }

    let instagram: string | null = null;
    if (prospect.business_id) {
      try {
        const { discoverInstagramForBusiness } = await import("./instagram-discovery.server");
        const found = await discoverInstagramForBusiness({ businessId: prospect.business_id });
        instagram = found.bestCandidate?.username ?? null;
      } catch {
        instagram = null;
      }
    }

    await client
      .from("area_prospects")
      .update({ website, instagram })
      .eq("id", prospect.id);

    return { ok: true as const, error: null, website, instagram };
  });

/** Saved area searches, so a street can be re-run later for new openings. */
export const saveAreaSearch = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ label: z.string().min(2).max(120), areaQuery: z.string().min(2).max(160), category: categoryEnum }).parse(
      data,
    ),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();
    await client.from("area_searches").insert({
      label: data.label,
      area_query: data.areaQuery,
      category: data.category,
      last_run_at: new Date().toISOString(),
      created_by_user_id: caller.userId,
    });
    return { ok: true as const, error: null };
  });

export const listAreaSearches = createServerFn({ method: "GET" }).handler(async () => {
  const caller = await gate();
  if (!caller.ok) return { ok: false as const, error: caller.error, searches: [] };
  const client = await db();
  const { data } = await client.from("area_searches").select("*").order("created_at", { ascending: false }).limit(20);
  return {
    ok: true as const,
    error: null,
    searches: (data ?? []).map((s) => ({
      id: s.id,
      label: s.label,
      areaQuery: s.area_query,
      category: s.category as string,
    })),
  };
});
