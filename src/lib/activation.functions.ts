import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DEMO_TOKEN = "demo-activation-token";

const DEMO_PLAQUE = {
  id: "demo",
  plaque_code: "TL-DEMO01",
  public_slug: "DEMOQR",
  status: "inventory",
  configured: false,
  claimed: false,
};

/** Public plaque identity from the printed/encoded slug. Never returns anything private. */
export const lookupPlaqueBySlug = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(3).max(40) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plaque } = await supabaseAdmin
      .from("plaques")
      .select("id, plaque_code, public_slug, status, configured_at, claimed_at")
      .eq("public_slug", data.slug)
      .maybeSingle();

    if (!plaque) return { found: false as const, plaque: null };
    return {
      found: true as const,
      plaque: {
        plaque_code: plaque.plaque_code,
        public_slug: plaque.public_slug,
        configured: Boolean(plaque.configured_at),
        claimed: Boolean(plaque.claimed_at),
      },
    };
  });

/** Private activation credential → the plaque it unlocks. Rate limited. */
export const lookupActivation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: z.string().min(6).max(200) }).parse(data))
  .handler(async ({ data }) => {
    if (data.token === DEMO_TOKEN) return { demo: true as const, rateLimited: false, plaque: DEMO_PLAQUE };

    const { allowActivationAttempt, activationHashes } = await import("./activation-guard.server");
    if (!(await allowActivationAttempt()))
      return { demo: false as const, rateLimited: true, plaque: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hashes = await activationHashes(data.token);
    const { data: plaque } = await supabaseAdmin
      .from("plaques")
      .select("id, plaque_code, public_slug, status, configured_at, claimed_at")
      .in("activation_token_hash", hashes)
      .maybeSingle();

    if (!plaque) return { demo: false as const, rateLimited: false, plaque: null };

    return {
      demo: false as const,
      rateLimited: false,
      plaque: {
        id: plaque.id,
        plaque_code: plaque.plaque_code,
        public_slug: plaque.public_slug,
        status: plaque.status as string,
        configured: Boolean(plaque.configured_at),
        claimed: Boolean(plaque.claimed_at),
      },
    };
  });

const businessSchema = z.object({
  placeId: z.string().max(300).nullable(),
  name: z.string().min(1).max(160),
  formattedAddress: z.string().max(300).nullable(),
  city: z.string().max(120).nullable(),
  region: z.string().max(120).nullable(),
  country: z.string().max(120).nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  phone: z.string().max(60).nullable(),
  website: z.string().max(500).nullable(),
  mapsUri: z.string().max(500).nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().nullable(),
  businessStatus: z.string().max(60).nullable(),
  primaryType: z.string().max(120).nullable(),
});

const completeSchema = z.object({
  token: z.string().min(6).max(200),
  business: businessSchema,
  goalType: z.string().min(1).max(60),
  destinationType: z.enum([
    "google_review",
    "instagram",
    "facebook",
    "menu",
    "booking",
    "coupon",
    "website",
    "call",
    "directions",
    "quote",
    "custom",
  ]),
  destinationUrl: z.string().max(500).nullable(),
  placementType: z.string().min(1).max(60),
  plaqueName: z.string().min(1).max(80),
});

/**
 * Turns an unassigned inventory plaque into a live one.
 * The plaque may start with no business at all — the business is created here, from the
 * confirmed Google listing, and only after the private activation credential checks out.
 */
export const completeActivation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => completeSchema.parse(data))
  .handler(async ({ data }) => {
    if (data.token === DEMO_TOKEN) {
      return { ok: true as const, demo: true as const, publicSlug: "DEMOQR", businessName: data.business.name };
    }

    const { allowActivationAttempt, activationHashes } = await import("./activation-guard.server");
    if (!(await allowActivationAttempt())) return { ok: false as const, error: "rate_limited" as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { googleReviewUrl } = await import("./google-places.server");

    const hashes = await activationHashes(data.token);
    const { data: plaque } = await supabaseAdmin
      .from("plaques")
      .select("id, business_id, public_slug, status, claimed_at")
      .in("activation_token_hash", hashes)
      .maybeSingle();

    if (!plaque) return { ok: false as const, error: "not_found" as const };
    if (plaque.claimed_at) return { ok: false as const, error: "already_claimed" as const };

    const b = data.business;
    const now = new Date().toISOString();

    // 1. Business — reuse the plaque's own if it already has one.
    let businessId = plaque.business_id;
    if (!businessId) {
      const { data: created, error } = await supabaseAdmin
        .from("businesses")
        .insert({
          name: b.name,
          industry: b.primaryType ?? "other",
          timezone: "America/Toronto",
          status: "active",
          is_demo: false,
        })
        .select("id")
        .single();
      if (error || !created) return { ok: false as const, error: "create_failed" as const };
      businessId = created.id;
    } else {
      await supabaseAdmin
        .from("businesses")
        .update({ name: b.name, industry: b.primaryType ?? "other" })
        .eq("id", businessId);
    }

    // 2. Location — never duplicate the same Google listing for one business.
    let locationId: string | null = null;
    if (b.placeId) {
      const { data: existing } = await supabaseAdmin
        .from("locations")
        .select("id")
        .eq("business_id", businessId)
        .eq("google_place_id", b.placeId)
        .maybeSingle();
      locationId = existing?.id ?? null;
    }

    const locationFields = {
      business_id: businessId,
      name: b.name,
      address: b.formattedAddress,
      city: b.city,
      province_state: b.region,
      country: b.country,
      active: true,
      google_place_id: b.placeId,
      google_maps_uri: b.mapsUri,
      website_url: b.website,
      phone: b.phone,
      google_rating: b.rating,
      google_review_count: b.reviewCount,
      google_business_status: b.businessStatus,
      google_primary_type: b.primaryType,
      latitude: b.latitude,
      longitude: b.longitude,
      public_data_last_synced_at: b.placeId ? now : null,
    };

    if (locationId) {
      await supabaseAdmin.from("locations").update(locationFields).eq("id", locationId);
    } else {
      const { data: createdLocation } = await supabaseAdmin
        .from("locations")
        .insert(locationFields)
        .select("id")
        .single();
      locationId = createdLocation?.id ?? null;
    }

    // 3. Goal
    await supabaseAdmin.from("goals").insert({ business_id: businessId, goal_type: data.goalType, active: true });

    // 4. Destination — derived from the confirmed listing where we can.
    let url = data.destinationUrl ?? b.website ?? b.mapsUri ?? "";
    if (data.destinationType === "google_review" && b.placeId) {
      const { reviewDestinationForLocation } = await import("./google-link.server");
      const resolved = locationId ? await reviewDestinationForLocation(supabaseAdmin, locationId) : null;
      url = resolved?.url ?? googleReviewUrl(b.placeId);
    }
    if (!url) return { ok: false as const, error: "no_destination" as const };

    await supabaseAdmin
      .from("destinations")
      .update({ active: false, effective_to: now })
      .eq("plaque_id", plaque.id)
      .is("effective_to", null);

    await supabaseAdmin.from("destinations").insert({
      business_id: businessId,
      plaque_id: plaque.id,
      destination_type: data.destinationType,
      url,
      effective_from: now,
      active: true,
      metadata: {
        google_place_id: b.placeId,
        business_name: b.name,
        source: b.placeId ? "google_places" : "manual",
      },
    });

    // 5. Placement history
    await supabaseAdmin.from("plaque_placement_history").insert({
      plaque_id: plaque.id,
      location_id: locationId,
      placement_type: data.placementType,
      placement_name: data.plaqueName,
      effective_from: now,
      reason: "activation",
    });

    // 6. Day Zero snapshots — only real numbers, never invented ones.
    const snapshots: Array<{
      business_id: string;
      location_id: string | null;
      metric_type: string;
      metric_value: number;
      captured_at: string;
      metadata: { source: string; google_place_id: string | null };
    }> = [];
    const snapshotMeta = { source: "google_places_public", google_place_id: b.placeId };
    if (typeof b.reviewCount === "number")
      snapshots.push({
        business_id: businessId,
        location_id: locationId,
        metric_type: "google_review_count",
        metric_value: b.reviewCount,
        captured_at: now,
        metadata: snapshotMeta,
      });
    if (typeof b.rating === "number")
      snapshots.push({
        business_id: businessId,
        location_id: locationId,
        metric_type: "google_rating",
        metric_value: b.rating,
        captured_at: now,
        metadata: snapshotMeta,
      });
    if (snapshots.length) await supabaseAdmin.from("metric_snapshots").insert(snapshots);

    // 7. Plaque goes live, still waiting for an account.
    await supabaseAdmin
      .from("plaques")
      .update({
        business_id: businessId,
        location_id: locationId,
        plaque_name: data.plaqueName,
        placement_type: data.placementType,
        status: "configured_unclaimed",
        activated_at: now,
        configured_at: now,
      })
      .eq("id", plaque.id);

    await supabaseAdmin.from("action_history").insert({
      business_id: businessId,
      plaque_id: plaque.id,
      action_type: "plaque_activated",
      initiated_by: "owner",
      new_value: { placement_type: data.placementType, destination_type: data.destinationType },
    });

    return {
      ok: true as const,
      demo: false as const,
      publicSlug: plaque.public_slug,
      businessName: b.name,
    };
  });

/**
 * Binds an activated plaque to the signed-in account. Once claimed, the printed
 * activation credential no longer grants any management rights.
 */
export const claimActivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ token: z.string().min(6).max(200) }).parse(data))
  .handler(async ({ data, context }) => {
    if (data.token === DEMO_TOKEN) return { ok: true as const, demo: true as const };

    const { activationHashes } = await import("./activation-guard.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const hashes = await activationHashes(data.token);
    const { data: plaque } = await supabaseAdmin
      .from("plaques")
      .select("id, business_id, claimed_at")
      .in("activation_token_hash", hashes)
      .maybeSingle();

    if (!plaque || !plaque.business_id) return { ok: false as const, error: "not_found" as const };
    if (plaque.claimed_at) return { ok: false as const, error: "already_claimed" as const };

    const now = new Date().toISOString();

    const { data: membership } = await supabaseAdmin
      .from("business_members")
      .select("id")
      .eq("business_id", plaque.business_id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!membership) {
      await supabaseAdmin.from("business_members").insert({
        business_id: plaque.business_id,
        user_id: context.userId,
        role: "owner",
      });
    }

    await supabaseAdmin
      .from("plaques")
      .update({
        status: "active",
        claimed_at: now,
        claimed_by_user_id: context.userId,
        activation_token_hash: null,
      })
      .eq("id", plaque.id);

    await supabaseAdmin.from("action_history").insert({
      business_id: plaque.business_id,
      plaque_id: plaque.id,
      action_type: "plaque_claimed",
      initiated_by: "owner",
      approved_by_user_id: context.userId,
    });

    return { ok: true as const, demo: false as const };
  });
