import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Instagram discovery endpoints.
 *
 * Everything expensive runs server-side; no search or Places credential ever
 * reaches the browser. Admin calls get a higher rate budget than the public
 * setup flow, and a profile an admin confirmed can never be silently replaced
 * by an anonymous visitor.
 */

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type SocialError = "unauthorized" | "forbidden" | "rate_limited" | "not_found" | "invalid" | "failed";

const empty = (error: SocialError) => ({
  ok: false as const,
  error,
  result: null,
});

/** Look up (and if needed discover) the public Instagram account for a business. */
export const discoverInstagram = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        force: z.boolean().optional(),
        deep: z.boolean().optional(),
        adminContext: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/admin-auth.server");
    const caller = await requireAdmin();
    const isAdmin = caller.ok;

    const { allowRequest } = await import("./activation-guard.server");
    const budget = isAdmin ? 300 : 30;
    if (!(await allowRequest(isAdmin ? "instagram-discovery-admin" : "instagram-discovery", budget))) {
      return empty("rate_limited");
    }

    // Only an admin may spend the deeper/forced search budget.
    const force = isAdmin ? Boolean(data.force) : false;
    const deep = isAdmin ? Boolean(data.deep) : false;

    try {
      const { discoverInstagramForBusiness } = await import("./instagram-discovery.server");
      const result = await discoverInstagramForBusiness({ businessId: data.businessId, force, deep });
      if (result.error) return empty("not_found");
      return { ok: true as const, error: null, result, isAdmin };
    } catch (err) {
      console.error("[instagram-discovery] failed", err);
      return empty("failed");
    }
  });

/** Confirm one account — admin confirmed profiles become the trusted answer. */
export const confirmInstagram = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        value: z.string().min(2).max(300),
        scope: z.enum(["location", "brand"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/admin-auth.server");
    const caller = await requireAdmin();
    if (!caller.ok) return { ok: false as const, error: caller.error as SocialError, profile: null };

    const { normalizeInstagram, loadBusinessContext } = await import("./instagram-discovery.server");
    const normalized = normalizeInstagram(data.value);
    if (!normalized) return { ok: false as const, error: "invalid" as SocialError, profile: null };

    const ctx = await loadBusinessContext(data.businessId);
    if (!ctx) return { ok: false as const, error: "not_found" as SocialError, profile: null };

    const client = await db();
    const now = new Date().toISOString();
    const { data: existing } = await client
      .from("business_social_profiles")
      .select("id")
      .eq("business_id", data.businessId)
      .eq("platform", "instagram")
      .eq("username", normalized.username)
      .maybeSingle();

    const row = {
      business_id: data.businessId,
      location_id: ctx.locationId,
      platform: "instagram",
      username: normalized.username,
      profile_url: normalized.profileUrl,
      scope: data.scope ?? "location",
      confidence: 100,
      verification_status: "manual",
      source: "admin_confirmed",
      evidence: [{ label: "Confirmed by a TapLocal admin", weight: 100, source: "admin" }] as never,
      verified_at: now,
      verified_by_user_id: caller.userId,
      last_checked_at: now,
    };

    if (existing) await client.from("business_social_profiles").update(row).eq("id", existing.id);
    else await client.from("business_social_profiles").insert(row);

    return {
      ok: true as const,
      error: null,
      profile: { username: normalized.username, profileUrl: normalized.profileUrl },
    };
  });

/** "That's not our account" — remembered so it is never suggested again. */
export const rejectInstagram = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ businessId: z.string().uuid(), username: z.string().min(2).max(60) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/admin-auth.server");
    const caller = await requireAdmin();
    if (!caller.ok) return { ok: false as const, error: caller.error as SocialError };

    const { normalizeInstagram } = await import("./instagram-discovery.server");
    const normalized = normalizeInstagram(data.username);
    if (!normalized) return { ok: false as const, error: "invalid" as SocialError };

    const client = await db();
    const now = new Date().toISOString();
    const { data: existing } = await client
      .from("business_social_profiles")
      .select("id")
      .eq("business_id", data.businessId)
      .eq("platform", "instagram")
      .eq("username", normalized.username)
      .maybeSingle();

    if (existing) {
      await client
        .from("business_social_profiles")
        .update({ verification_status: "rejected", confidence: 0, last_checked_at: now })
        .eq("id", existing.id);
    } else {
      await client.from("business_social_profiles").insert({
        business_id: data.businessId,
        platform: "instagram",
        username: normalized.username,
        profile_url: normalized.profileUrl,
        verification_status: "rejected",
        confidence: 0,
        source: "admin_rejected",
        last_checked_at: now,
      });
    }

    return { ok: true as const, error: null };
  });

/** Saved profiles for the admin business record. */
export const listSocialProfiles = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ businessId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/admin-auth.server");
    const caller = await requireAdmin();
    if (!caller.ok) return { ok: false as const, error: caller.error as SocialError, profiles: [] };

    const client = await db();
    const { data: rows } = await client
      .from("business_social_profiles")
      .select("id, platform, username, profile_url, scope, confidence, verification_status, source, evidence, last_checked_at, verified_at")
      .eq("business_id", data.businessId)
      .neq("verification_status", "rejected")
      .order("confidence", { ascending: false });

    return { ok: true as const, error: null, profiles: rows ?? [] };
  });
