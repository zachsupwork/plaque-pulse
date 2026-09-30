import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * "What could this be worth?" — extends the existing analytics with review and
 * follower growth. Reads existing tables only (events, google_review_observations,
 * metric_snapshots, business_social_profiles, attribution_candidates) plus
 * social_follower_snapshots. Correlation is never presented as confirmed.
 */

type Badge = "OBSERVED" | "EXTERNAL" | "INFERRED" | "CONFIRMED";
type Amp = "Standard" | "Elevated amplification potential" | "High amplification potential";

const DAY = 86_400_000;
const REVIEW_WINDOW_MS = 24 * 3_600_000;

async function authorize(businessId: string | null) {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  const admin = await requireAdmin();
  if (admin.ok) return { ok: true as const, admin: true };
  if (!businessId) return { ok: false as const };
  const { requireBusinessAccess } = await import("@/lib/business-auth.server");
  const biz = await requireBusinessAccess(businessId);
  return biz.ok ? { ok: true as const, admin: false } : { ok: false as const };
}

function reviewerReach(evidence: Record<string, unknown> | null): { level: Amp; evidence: string[] } {
  const e = evidence ?? {};
  const count = Number(e["contributor_review_count"] ?? e["contributions"] ?? 0);
  const guide = Number(e["local_guide_level"] ?? 0);
  const notes: string[] = [];
  if (count) notes.push(`${count} public contributions`);
  if (guide) notes.push(`Local Guide level ${guide}`);
  if (count >= 500 || guide >= 8) return { level: "High amplification potential", evidence: notes };
  if (count >= 100 || guide >= 5) return { level: "Elevated amplification potential", evidence: notes };
  return { level: "Standard", evidence: notes.length ? notes : ["No public reach evidence recorded"] };
}

function firstLast<T extends { captured_at: string }>(rows: T[]) {
  if (!rows.length) return null;
  const s = [...rows].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  return { first: s[0]!, last: s[s.length - 1]! };
}

export const impactSummary = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ businessId: z.string().uuid().nullable(), days: z.number().int().min(1).max(365) }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await authorize(data.businessId);
    if (!auth.ok) return { ok: false as const, error: "forbidden" };
    const { supabaseAdmin: c } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * DAY).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const biz = (q: any): any => (data.businessId ? q.eq("business_id", data.businessId) : q);

    try {
      const [ev, reviews, snaps, followers, cands] = await Promise.all([
        biz(
          c.from("events")
            .select("id, business_id, source_type, destination_type, occurred_at")
            .eq("event_type", "interaction")
            .in("source_type", ["nfc", "qr"])
            .gte("occurred_at", since),
        ).limit(5000),
        biz(
          c.from("google_review_observations")
            .select("id, business_id, author_name, rating, published_at, first_seen_at, evidence")
            .gte("first_seen_at", since),
        ).limit(500),
        biz(
          c.from("metric_snapshots")
            .select("business_id, metric_type, metric_value, captured_at")
            .in("metric_type", ["google_review_count", "google_rating", "avg_transaction_value", "conversion_rate"]),
        ).order("captured_at", { ascending: true }).limit(5000),
        biz(
          c.from("social_follower_snapshots")
            .select("business_id, social_profile_id, followers_count, captured_at, source"),
        ).order("captured_at", { ascending: true }).limit(5000),
        biz(
          c.from("attribution_candidates").select("event_id, kind, confidence, external_ref").gte("created_at", since),
        ).limit(2000),
      ]);
      if (ev.error) throw ev.error;

      type E = { id: string; business_id: string | null; source_type: string; destination_type: string | null; occurred_at: string };
      const events = (ev.data ?? []) as E[];
      const reviewTaps = events.filter((e) => e.destination_type === "google_review");
      const igTaps = events.filter((e) => e.destination_type === "instagram");
      const split = (l: E[]) => ({
        total: l.length,
        nfc: l.filter((e) => e.source_type === "nfc").length,
        qr: l.filter((e) => e.source_type === "qr").length,
      });

      /* ---- Google reviews ---- */
      type R = { id: string; business_id: string; author_name: string | null; rating: number | null; published_at: string | null; first_seen_at: string; evidence: Record<string, unknown> | null };
      type C = { event_id: string; kind: string; confidence: number; external_ref: string | null };
      const candList = (cands.data ?? []) as C[];
      const reviewRows = ((reviews.data ?? []) as R[]).map((r) => {
        const at = new Date(r.published_at ?? r.first_seen_at).getTime();
        const prior = reviewTaps
          .filter((t) => t.business_id === r.business_id)
          .map((t) => ({ t, gap: at - new Date(t.occurred_at).getTime() }))
          .filter((x) => x.gap >= 0 && x.gap <= REVIEW_WINDOW_MS)
          .sort((a, b) => a.gap - b.gap);
        const nearest = prior[0];
        const cand = candList.find((x) => x.external_ref === r.id || (nearest && x.event_id === nearest.t.id && x.kind.includes("review")));
        const reach = reviewerReach(r.evidence);
        const badge: Badge = nearest ? "INFERRED" : "EXTERNAL";
        return {
          id: r.id,
          author: r.author_name,
          rating: r.rating,
          detectedAt: r.published_at ?? r.first_seen_at,
          timingExact: Boolean(r.published_at),
          tapSource: nearest?.t.source_type ?? null,
          tapEventId: nearest?.t.id ?? null,
          gapMinutes: nearest ? Math.round(nearest.gap / 60_000) : null,
          competingTaps: Math.max(0, prior.length - 1),
          confidence: cand?.confidence ?? (nearest ? Math.max(10, Math.min(80, 80 - Math.round(nearest.gap / 3_600_000) * 4 - (prior.length - 1) * 8)) : null),
          badge,
          reach: reach.level,
          reachEvidence: reach.evidence,
        };
      });

      type S = { business_id: string; metric_type: string; metric_value: number; captured_at: string };
      const snapList = (snaps.data ?? []) as S[];
      const deltaFor = (metric: string) => {
        if (!data.businessId) return null;
        const all = snapList.filter((s) => s.metric_type === metric);
        const before = all.filter((s) => s.captured_at < since).pop();
        const inWin = all.filter((s) => s.captured_at >= since);
        const fl = firstLast(inWin);
        if (!fl) return null;
        return { previous: Number((before ?? fl.first).metric_value), current: Number(fl.last.metric_value) };
      };

      /* ---- Instagram followers ---- */
      type F = { business_id: string; social_profile_id: string | null; followers_count: number; captured_at: string; source: string };
      const fList = (followers.data ?? []) as F[];
      const byKey = new Map<string, F[]>();
      for (const f of fList) {
        const k = `${f.business_id}:${f.social_profile_id ?? ""}`;
        byKey.set(k, [...(byKey.get(k) ?? []), f]);
      }
      let followerDelta: { previous: number; current: number; source: string } | null = null;
      let gained = 0;
      for (const rows of byKey.values()) {
        const before = rows.filter((r) => r.captured_at < since).pop();
        const inWin = rows.filter((r) => r.captured_at >= since);
        const fl = firstLast(inWin);
        if (!fl) continue;
        const prev = (before ?? fl.first).followers_count;
        gained += fl.last.followers_count - prev;
        if (data.businessId && !followerDelta) followerDelta = { previous: prev, current: fl.last.followers_count, source: fl.last.source };
      }
      const followersKnown = [...byKey.values()].some((r) => r.some((x) => x.captured_at >= since));

      /* ---- Modelled opportunity (only with business-supplied inputs) ---- */
      const latest = (m: string) => {
        const v = snapList.filter((s) => s.metric_type === m).pop();
        return v ? Number(v.metric_value) : null;
      };
      const atv = data.businessId ? latest("avg_transaction_value") : null;
      const conv = data.businessId ? latest("conversion_rate") : null;
      const relevant = reviewTaps.length + igTaps.length;
      let opportunity: { low: number; high: number; assumptions: string[] } | null = null;
      if (atv && conv && conv > 0 && conv <= 1 && relevant >= 10) {
        const base = relevant * conv * atv;
        opportunity = {
          low: Math.round(base * 0.5),
          high: Math.round(base),
          assumptions: [
            `${relevant} review/Instagram taps observed by TapLocal`,
            `Conversion rate ${Math.round(conv * 100)}% (entered for this business)`,
            `Average transaction $${atv.toFixed(2)} (entered for this business)`,
            "Low end halves the result to allow for customers who would have come anyway",
          ],
        };
      }

      const elevated = reviewRows.filter((r) => r.reach !== "Standard").length;
      const linked = reviewRows.filter((r) => r.badge === "INFERRED").length;
      const confidence =
        opportunity && linked >= 3 ? "Medium" : linked > 0 || gained > 0 ? "Low" : "Not enough data";

      return {
        ok: true as const,
        admin: auth.admin,
        interactions: split(events),
        reviewTaps: split(reviewTaps),
        instagramTaps: split(igTaps),
        reviews: reviewRows,
        reviewCount: deltaFor("google_review_count"),
        rating: deltaFor("google_rating"),
        followers: { known: followersKnown, gained, delta: followerDelta },
        elevatedReviews: elevated,
        opportunity,
        confidence,
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "unavailable" };
    }
  });

/** Admin records a follower count read from Meta/Instagram (never scraped). */
export const recordFollowerCount = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      businessId: z.string().uuid(),
      followers: z.number().int().min(0).max(1_000_000_000),
      source: z.enum(["manual", "meta_api"]).default("manual"),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/admin-auth.server");
    const a = await requireAdmin();
    if (!a.ok) return { ok: false as const, error: a.error };
    const { supabaseAdmin: c } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await c
      .from("business_social_profiles")
      .select("id")
      .eq("business_id", data.businessId)
      .eq("platform", "instagram")
      .limit(1)
      .maybeSingle();
    const { error } = await c.from("social_follower_snapshots").insert({
      business_id: data.businessId,
      social_profile_id: profile?.id ?? null,
      followers_count: data.followers,
      source: data.source,
    });
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

/** Admin enters the business's own value inputs for the modelled opportunity. */
export const recordValueInputs = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      businessId: z.string().uuid(),
      avgTransactionValue: z.number().positive().max(1_000_000),
      conversionRate: z.number().gt(0).max(1),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/admin-auth.server");
    const a = await requireAdmin();
    if (!a.ok) return { ok: false as const, error: a.error };
    const { supabaseAdmin: c } = await import("@/integrations/supabase/client.server");
    const { error } = await c.from("metric_snapshots").insert([
      { business_id: data.businessId, metric_type: "avg_transaction_value", metric_value: data.avgTransactionValue, metadata: { source: "admin_entered" } },
      { business_id: data.businessId, metric_type: "conversion_rate", metric_value: data.conversionRate, metadata: { source: "admin_entered" } },
    ]);
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });
