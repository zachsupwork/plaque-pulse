import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Single source of truth for the Tap → Result → Amplification → Visibility →
 * Business value chain. WorthCard, owner Results ("connected accounts") and
 * admin analytics all read this one calculation so they never contradict.
 * Correlation is never presented as confirmed.
 */

type Badge = "OBSERVED" | "EXTERNAL" | "INFERRED" | "CONFIRMED";
type Amp = "Standard" | "Elevated amplification potential" | "High amplification potential";

const DAY = 86_400_000;
const REVIEW_WINDOW_MS = 24 * 3_600_000;

export const GBP_METRICS: Record<string, string> = {
  gbp_search_impressions: "Search impressions",
  gbp_maps_impressions: "Maps impressions",
  gbp_profile_views: "Profile views",
  gbp_direction_requests: "Direction requests",
  gbp_call_clicks: "Call clicks",
  gbp_website_clicks: "Website clicks",
  gbp_bookings: "Bookings / orders",
};
export const IG_METRICS: Record<string, string> = {
  ig_reach: "Reach",
  ig_impressions: "Impressions",
  ig_profile_visits: "Profile visits",
  ig_engagement: "Engagement",
  ig_link_clicks: "Link clicks",
};
const ACTION_METRICS = ["gbp_direction_requests", "gbp_call_clicks", "gbp_website_clicks", "gbp_bookings"];

async function authorize(businessId: string | null) {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  const admin = await requireAdmin();
  if (admin.ok) return { ok: true as const, admin: true };
  if (!businessId) return { ok: false as const };
  const { requireBusinessAccess } = await import("@/lib/business-auth.server");
  const biz = await requireBusinessAccess(businessId);
  return biz.ok ? { ok: true as const, admin: false } : { ok: false as const };
}

/** Classify contributor reach from stored evidence only; always explain why. */
function reviewerReach(evidence: Record<string, unknown> | null) {
  const e = evidence ?? {};
  const reach = (e["reach"] ?? {}) as Record<string, unknown>;
  const num = (...k: string[]) => {
    for (const key of k) {
      const v = Number(reach[key] ?? e[key]);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return 0;
  };
  const guide = num("local_guide_level");
  const reviews = num("review_count", "contributor_review_count", "contributions");
  const photos = num("photo_count");
  const views = num("photo_views");
  const why: string[] = [];
  if (guide) why.push(`Local Guide level ${guide}`);
  if (reviews) why.push(`${reviews.toLocaleString()} public reviews/contributions`);
  if (photos) why.push(`${photos.toLocaleString()} photos/videos`);
  if (views) why.push(`${views.toLocaleString()} historical photo views`);
  let level: Amp = "Standard";
  if (guide >= 8 || reviews >= 500 || views >= 100_000) level = "High amplification potential";
  else if (guide >= 5 || reviews >= 100 || photos >= 100 || views >= 10_000) level = "Elevated amplification potential";
  return {
    level,
    evidence: why.length ? why : ["No public reach evidence recorded"],
    profileUrl: (reach["profile_url"] as string) ?? null,
    source: (reach["source"] as string) ?? null,
    checkedAt: (reach["checked_at"] as string) ?? null,
    values: { guide, reviews, photos, views },
  };
}

type Snap = { business_id: string; metric_type: string; metric_value: number; captured_at: string };

/** Level metric (count/rating): last value before window (or first in window) → latest value. */
function levelDelta(all: Snap[], metric: string, since: string) {
  const series = all.filter((s) => s.metric_type === metric);
  if (!series.length) return null;
  const before = series.filter((s) => s.captured_at < since).pop();
  const inWin = series.filter((s) => s.captured_at >= since);
  const last = series[series.length - 1]!;
  const prev = before ?? inWin[0] ?? last;
  return { previous: Number(prev.metric_value), current: Number(last.metric_value), updatedInPeriod: inWin.length > 0, lastAt: last.captured_at };
}

/** Flow metric (daily totals): sum in this period vs the equal period before. */
function periodCompare(all: Snap[], metric: string, since: string, prevSince: string) {
  const series = all.filter((s) => s.metric_type === metric);
  if (!series.length) return null;
  const sum = (l: Snap[]) => l.reduce((a, s) => a + Number(s.metric_value), 0);
  const cur = series.filter((s) => s.captured_at >= since);
  const prev = series.filter((s) => s.captured_at >= prevSince && s.captured_at < since);
  if (!cur.length && !prev.length) return null;
  return { metric, before: sum(prev), after: sum(cur), hasBefore: prev.length > 0 };
}

export const impactSummary = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ businessId: z.string().uuid().nullable(), days: z.number().int().min(1).max(365) }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await authorize(data.businessId);
    if (!auth.ok) return { ok: false as const, error: "forbidden" };
    const { supabaseAdmin: c } = await import("@/integrations/supabase/client.server");
    const now = Date.now();
    const since = new Date(now - data.days * DAY).toISOString();
    const prevSince = new Date(now - 2 * data.days * DAY).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const biz = (q: any): any => (data.businessId ? q.eq("business_id", data.businessId) : q);

    try {
      const [ev, reviews, snaps, followers, cands, photos] = await Promise.all([
        biz(
          c.from("events")
            .select("id, business_id, source_type, destination_type, occurred_at")
            .eq("event_type", "interaction")
            .in("source_type", ["nfc", "qr"])
            .gte("occurred_at", prevSince),
        ).limit(10000),
        biz(
          c.from("google_review_observations")
            .select("id, business_id, author_name, author_profile_url, rating, published_at, first_seen_at, evidence")
            .gte("first_seen_at", since),
        ).limit(500),
        biz(c.from("metric_snapshots").select("business_id, metric_type, metric_value, captured_at"))
          .order("captured_at", { ascending: true })
          .limit(10000),
        biz(c.from("social_follower_snapshots").select("business_id, social_profile_id, followers_count, captured_at, source"))
          .order("captured_at", { ascending: true })
          .limit(5000),
        biz(c.from("attribution_candidates").select("event_id, kind, confidence, external_ref").gte("created_at", since)).limit(2000),
        biz(
          c.from("maps_photo_observations")
            .select("id, business_id, contributor_name, status, previous_status, status_changed_at, gallery_rank, verification_type, confidence")
            .gte("status_changed_at", since),
        ).limit(500),
      ]);
      if (ev.error) throw ev.error;

      type E = { id: string; business_id: string | null; source_type: string; destination_type: string | null; occurred_at: string };
      const allEvents = (ev.data ?? []) as E[];
      const events = allEvents.filter((e) => e.occurred_at >= since);
      const prevEvents = allEvents.filter((e) => e.occurred_at < since);
      const reviewTaps = events.filter((e) => e.destination_type === "google_review");
      const igTaps = events.filter((e) => e.destination_type === "instagram");
      const split = (l: E[]) => ({
        total: l.length,
        nfc: l.filter((e) => e.source_type === "nfc").length,
        qr: l.filter((e) => e.source_type === "qr").length,
      });

      /* ---- Snapshots: one series for every surface ---- */
      const snapList = ((snaps.data ?? []) as Snap[]).map((s) => ({ ...s, metric_value: Number(s.metric_value) }));
      const single = Boolean(data.businessId);
      const reviewCount = single ? levelDelta(snapList, "google_review_count", since) : null;
      const rating = single ? levelDelta(snapList, "google_rating", since) : null;
      const connected = single
        ? [...new Set(snapList.map((s) => s.metric_type))]
            .filter((m) => !(m in GBP_METRICS) && !(m in IG_METRICS) && m !== "avg_transaction_value" && m !== "conversion_rate" && m !== "customer_lifetime_value")
            .map((m) => ({ metric: m, ...levelDelta(snapList, m, since)! }))
        : [];

      /* ---- Google reviews ---- */
      type R = { id: string; business_id: string; author_name: string | null; author_profile_url: string | null; rating: number | null; published_at: string | null; first_seen_at: string; evidence: Record<string, unknown> | null };
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
          authorUrl: reach.profileUrl ?? r.author_profile_url,
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
          reachSource: reach.source,
          reachCheckedAt: reach.checkedAt,
          reachValues: reach.values,
        };
      });
      // Count growth can exceed individually-detected reviews (Places returns only a few).
      const countGrowth = reviewCount ? Math.max(0, reviewCount.current - reviewCount.previous) : 0;
      const newReviews = Math.max(reviewRows.length, countGrowth);

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
        if (!inWin.length) continue;
        const last = inWin[inWin.length - 1]!;
        const prev = (before ?? inWin[0]!).followers_count;
        gained += last.followers_count - prev;
        if (single && !followerDelta) followerDelta = { previous: prev, current: last.followers_count, source: last.source };
      }
      // Fallback: follower metric captured as a connected-account snapshot.
      if (!followerDelta && single) {
        const d = levelDelta(snapList, "instagram_followers", since);
        if (d && d.updatedInPeriod) {
          followerDelta = { previous: d.previous, current: d.current, source: "connected_account" };
          gained = d.current - d.previous;
        }
      }
      const followersKnown = Boolean(followerDelta) || [...byKey.values()].some((r) => r.some((x) => x.captured_at >= since));

      /* ---- Google Business Profile performance + Instagram insights ---- */
      const gbp = single ? Object.keys(GBP_METRICS).map((m) => periodCompare(snapList, m, since, prevSince)).filter(Boolean) as NonNullable<ReturnType<typeof periodCompare>>[] : [];
      const ig = single ? Object.keys(IG_METRICS).map((m) => periodCompare(snapList, m, since, prevSince)).filter(Boolean) as NonNullable<ReturnType<typeof periodCompare>>[] : [];
      const visUp = gbp.some((g) => (g.metric === "gbp_search_impressions" || g.metric === "gbp_maps_impressions") && g.hasBefore && g.after > g.before);
      const actions = gbp.filter((g) => ACTION_METRICS.includes(g.metric));
      const actionDelta = actions.every((a) => a.hasBefore) && actions.length ? actions.reduce((s, a) => s + (a.after - a.before), 0) : null;

      /* ---- Photo prominence (Maps Photo Watch) ---- */
      type P = { id: string; contributor_name: string | null; status: string; previous_status: string | null; status_changed_at: string; gallery_rank: number | null; verification_type: string; confidence: number };
      const verified = (p: P) => ["manual", "screenshot", "screen_recording", "staff"].some((v) => p.verification_type?.includes(v));
      const photoLabel = (p: P) => {
        if (p.status === "main_photo" || p.status === "cover_photo") return verified(p) ? "Verified prominent image" : "Top returned Google photo";
        if (p.status === "top_3") return "Entered top 3";
        if (p.status === "top_10") return "Entered top 10";
        if (p.status === "gallery_only") return "Gallery only";
        if (p.status === "no_longer_prominent") return "Lost prominence";
        return p.status.replace(/_/g, " ");
      };
      const photoChanges = ((photos.data ?? []) as P[])
        .sort((a, b) => b.status_changed_at.localeCompare(a.status_changed_at))
        .map((p) => ({
          id: p.id,
          contributor: p.contributor_name,
          label: photoLabel(p),
          from: p.previous_status,
          at: p.status_changed_at,
          badge: (verified(p) ? "CONFIRMED" : "EXTERNAL") as Badge,
          confidence: p.confidence,
        }));
      const prominentGains = photoChanges.filter((p) => !["Gallery only", "Lost prominence"].includes(p.label)).length;

      /* ---- Modelled opportunity: business inputs only, end of chain ---- */
      const latest = (m: string) => {
        const v = snapList.filter((s) => s.metric_type === m).pop();
        return v ? Number(v.metric_value) : null;
      };
      const atv = single ? latest("avg_transaction_value") : null;
      const conv = single ? latest("conversion_rate") : null;
      const clv = single ? latest("customer_lifetime_value") : null;
      const relevant = reviewTaps.length + igTaps.length;
      let opportunity: { low: number; high: number; assumptions: string[] } | null = null;
      if (atv && conv && conv > 0 && conv <= 1 && relevant >= 10) {
        const base = relevant * conv * atv;
        const assumptions = [
          `${relevant} review/Instagram taps observed by TapLocal`,
          `Conversion rate ${Math.round(conv * 100)}% (entered for this business)`,
          `Average transaction $${atv.toFixed(2)} (entered for this business)`,
          "Low end halves the result to allow for customers who would have come anyway",
        ];
        if (actionDelta != null) assumptions.push(`Google actions (calls/directions/clicks/bookings) changed by ${actionDelta >= 0 ? "+" : ""}${actionDelta} vs the previous period — shown for context, not added to the estimate`);
        if (clv) assumptions.push(`Customer lifetime value $${clv.toFixed(2)} recorded — not used, to keep the estimate conservative`);
        opportunity = { low: Math.round(base * 0.5), high: Math.round(base), assumptions };
      }

      const elevated = reviewRows.filter((r) => r.reach !== "Standard").length;
      const linked = reviewRows.filter((r) => r.badge === "INFERRED").length;
      const confidence =
        opportunity && linked >= 3 ? "Medium" : linked > 0 || gained > 0 || countGrowth > 0 ? "Low" : "Not enough data";

      /* ---- Evidence chain ---- */
      const timeline: { stage: string; badge: Badge; detail: string; measured: boolean }[] = [
        { stage: "Tap/Scan", badge: "OBSERVED", measured: events.length > 0, detail: `${events.length} taps/scans (${prevEvents.length} in the previous period)` },
        { stage: "Destination", badge: "OBSERVED", measured: relevant > 0, detail: `${reviewTaps.length} to Google Reviews · ${igTaps.length} to Instagram` },
        { stage: "Review/Follow", badge: linked ? "INFERRED" : "EXTERNAL", measured: newReviews > 0 || followersKnown, detail: `${newReviews} new reviews${followersKnown ? ` · ${gained >= 0 ? "+" : ""}${gained} followers` : " · followers unavailable"}${linked ? ` · ${linked} within 24h of a review tap` : ""}` },
        { stage: "Contributor strength", badge: "EXTERNAL", measured: elevated > 0, detail: elevated ? `${elevated} elevated/high-reach reviewer${elevated > 1 ? "s" : ""}` : "No high-reach evidence recorded" },
        { stage: "Photo/social amplification", badge: photoChanges.some((p) => p.badge === "CONFIRMED") ? "CONFIRMED" : "EXTERNAL", measured: photoChanges.length > 0, detail: photoChanges.length ? `${prominentGains} prominence gains · ${photoChanges.length} photo changes` : "No photo prominence changes recorded" },
        { stage: "Organic visibility change", badge: "INFERRED", measured: gbp.length > 0, detail: gbp.length ? (visUp ? "Organic visibility increased after this result — possible contribution, not confirmed." : "No visibility increase vs the previous period") : "Google performance data not connected." },
        { stage: "Calls/Directions/Clicks/Bookings", badge: "EXTERNAL", measured: actionDelta != null, detail: actionDelta != null ? `${actionDelta >= 0 ? "+" : ""}${actionDelta} vs the previous period` : "Not measured" },
        { stage: "Potential business value", badge: "INFERRED", measured: Boolean(opportunity), detail: opportunity ? `$${opportunity.low.toLocaleString()}–$${opportunity.high.toLocaleString()} modelled` : "Not enough data yet to estimate a reliable dollar value." },
      ];

      return {
        ok: true as const,
        admin: auth.admin,
        interactions: split(events),
        reviewTaps: split(reviewTaps),
        instagramTaps: split(igTaps),
        reviews: reviewRows,
        newReviews,
        reviewCount,
        rating,
        connected,
        followers: { known: followersKnown, gained, delta: followerDelta },
        gbp: { connected: gbp.length > 0, metrics: gbp.map((g) => ({ ...g, label: GBP_METRICS[g.metric]! })), visibilityUp: visUp },
        instagramInsights: ig.map((g) => ({ ...g, label: IG_METRICS[g.metric]! })),
        photoChanges: photoChanges.slice(0, 8),
        prominentGains,
        elevatedReviews: elevated,
        timeline,
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
      customerLifetimeValue: z.number().positive().max(10_000_000).nullable().default(null),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/admin-auth.server");
    const a = await requireAdmin();
    if (!a.ok) return { ok: false as const, error: a.error };
    const { supabaseAdmin: c } = await import("@/integrations/supabase/client.server");
    const meta = { source: "admin_entered" };
    const rows = [
      { business_id: data.businessId, metric_type: "avg_transaction_value", metric_value: data.avgTransactionValue, metadata: meta },
      { business_id: data.businessId, metric_type: "conversion_rate", metric_value: data.conversionRate, metadata: meta },
    ];
    if (data.customerLifetimeValue) rows.push({ business_id: data.businessId, metric_type: "customer_lifetime_value", metric_value: data.customerLifetimeValue, metadata: meta });
    const { error } = await c.from("metric_snapshots").insert(rows);
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

/**
 * Admin records a daily Google Business Profile or Instagram insights value
 * read from the connected account/report (used until a live API sync exists).
 */
export const recordPerformanceMetric = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      businessId: z.string().uuid(),
      metric: z.enum([...Object.keys(GBP_METRICS), ...Object.keys(IG_METRICS)] as [string, ...string[]]),
      value: z.number().min(0).max(1_000_000_000),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/admin-auth.server");
    const a = await requireAdmin();
    if (!a.ok) return { ok: false as const, error: a.error };
    const { supabaseAdmin: c } = await import("@/integrations/supabase/client.server");
    const { error } = await c.from("metric_snapshots").insert({
      business_id: data.businessId,
      metric_type: data.metric,
      metric_value: data.value,
      captured_at: `${data.date}T12:00:00Z`,
      metadata: { source: "admin_entered_from_report", entered_by: a.userId },
    });
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

/** Admin-verified contributor reach evidence (Google doesn't expose it via API). */
export const recordReviewerReach = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      observationId: z.string().uuid(),
      localGuideLevel: z.number().int().min(0).max(10).nullable(),
      reviewCount: z.number().int().min(0).max(10_000_000).nullable(),
      photoCount: z.number().int().min(0).max(10_000_000).nullable(),
      photoViews: z.number().int().min(0).max(100_000_000_000).nullable(),
      profileUrl: z.string().url().max(500).nullable(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/admin-auth.server");
    const a = await requireAdmin();
    if (!a.ok) return { ok: false as const, error: a.error };
    const { supabaseAdmin: c } = await import("@/integrations/supabase/client.server");
    const { data: row } = await c.from("google_review_observations").select("evidence").eq("id", data.observationId).maybeSingle();
    if (!row) return { ok: false as const, error: "not_found" };
    const evidence = { ...((row.evidence as Record<string, unknown>) ?? {}) };
    evidence["reach"] = {
      local_guide_level: data.localGuideLevel,
      review_count: data.reviewCount,
      photo_count: data.photoCount,
      photo_views: data.photoViews,
      profile_url: data.profileUrl,
      source: "admin_verified",
      checked_at: new Date().toISOString(),
      verified_by: a.userId,
    };
    const { error } = await c.from("google_review_observations").update({ evidence: evidence as never }).eq("id", data.observationId);
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });
