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
  ig_views: "Views",
  ig_total_interactions: "Total interactions",
  ig_likes: "Likes",
  ig_comments: "Comments",
  ig_shares: "Shares",
  ig_saves: "Saves",
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
      const [ev, reviews, snaps, followers, cands, photos, outs, socials] = await Promise.all([
        biz(
          c.from("events")
            .select("id, business_id, source_type, destination_type, occurred_at, anonymous_visitor_key")
            .eq("event_type", "interaction")
            .in("source_type", ["nfc", "qr"])
            .gte("occurred_at", prevSince),
        ).order("occurred_at", { ascending: true }).limit(10000),
        biz(
          c.from("google_review_observations")
            .select("id, business_id, author_name, author_profile_url, rating, published_at, first_seen_at, evidence")
            .gte("first_seen_at", since),
        ).limit(500),
        biz(c.from("metric_snapshots").select("business_id, metric_type, metric_value, captured_at"))
          .order("captured_at", { ascending: true })
          .limit(10000),
        biz(c.from("social_follower_snapshots").select("business_id, social_profile_id, followers_count, follows_count, media_count, data_scope, captured_at, source"))
          .order("captured_at", { ascending: true })
          .limit(5000),
        biz(c.from("attribution_candidates").select("event_id, kind, confidence, external_ref").gte("created_at", since)).limit(2000),
        biz(
          c.from("maps_photo_observations")
            .select("id, business_id, contributor_name, status, previous_status, status_changed_at, gallery_rank, verification_type, confidence")
            .gte("status_changed_at", since),
        ).limit(500),
        biz(c.from("outcomes").select("outcome_type, attribution_type, value, occurred_at").gte("occurred_at", since)).limit(5000),
        data.businessId
          ? c.from("business_social_profiles")
              .select("id, username, profile_url, scope, verification_status, source, evidence, last_checked_at")
              .eq("business_id", data.businessId)
              .eq("platform", "instagram")
              .neq("verification_status", "rejected")
              .limit(50)
          : Promise.resolve({ data: [] }),
      ]);
      if (ev.error) throw ev.error;

      type E = { id: string; business_id: string | null; source_type: string; destination_type: string | null; occurred_at: string; anonymous_visitor_key: string | null };
      const allEvents = (ev.data ?? []) as E[];
      // TapLocal Page taps inherit the link the visitor chose (still counted once, as the tap).
      {
        const { pageChoices } = await import("./attribution.server");
        const pending = allEvents.filter((e) => !e.destination_type).map((e) => e.id);
        if (pending.length) {
          const chosen = await pageChoices(c, pending);
          for (const e of allEvents) if (!e.destination_type && chosen.has(e.id)) e.destination_type = chosen.get(e.id)!;
        }
      }
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
      const countGrowth = reviewCount ? Math.max(0, reviewCount.current - reviewCount.previous) : 0;
      const newReviews = Math.max(reviewRows.length, countGrowth);

      /* ---- Instagram followers ---- */
      type F = { business_id: string; social_profile_id: string | null; followers_count: number; follows_count: number | null; media_count: number | null; data_scope: string; captured_at: string; source: string };
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

      /* ---- Return & referral signals (anonymous keys never leave the server) ---- */
      const vk = (e: E) => (e.anonymous_visitor_key ? `${e.business_id ?? ""}:${e.anonymous_visitor_key}` : null);
      const firstSeen = new Map<string, string>();
      const lastSeen = new Map<string, string>();
      for (const e of allEvents) {
        const k = vk(e);
        if (!k) continue;
        if (!firstSeen.has(k)) firstSeen.set(k, e.occurred_at);
        lastSeen.set(k, e.occurred_at);
      }
      const keyedNow = events.filter((e) => vk(e));
      const curCount = new Map<string, number>();
      for (const e of keyedNow) curCount.set(vk(e)!, (curCount.get(vk(e)!) ?? 0) + 1);
      const uniques = curCount.size;
      const returning = [...curCount.entries()].filter(([k, n]) => n > 1 || (firstSeen.get(k) ?? since) < since).length;
      const repeatRate = keyedNow.length ? Math.round(((keyedNow.length - uniques) / keyedNow.length) * 100) : null;
      // Equal windows around the earliest review/photo outcome in this period.
      const outcomeTimes = [...reviewRows.map((r) => r.detectedAt), ...photoChanges.filter((p) => !["Gallery only", "Lost prominence"].includes(p.label)).map((p) => p.at)].filter((t) => t >= since).sort();
      let lift: { anchor: string; windowDays: number; before: number; after: number; up: boolean } | null = null;
      if (single && outcomeTimes[0]) {
        const T = new Date(outcomeTimes[0]).getTime();
        const W = Math.min(7 * DAY, now - T, T - new Date(prevSince).getTime());
        if (W >= DAY) {
          const newIn = (a: number, b: number) => [...firstSeen.values()].filter((t) => { const x = new Date(t).getTime(); return x >= a && x < b; }).length;
          const before = newIn(T - W, T), after = newIn(T, T + W);
          lift = { anchor: outcomeTimes[0], windowDays: Math.round(W / DAY), before, after, up: after > before };
        }
      }
      // Per-interaction visitor signals for the most recent taps.
      const recent = [...events].reverse().slice(0, 10);
      const recentKeys = [...new Set(recent.map((e) => e.anonymous_visitor_key).filter(Boolean))] as string[];
      const otherBiz = new Map<string, Set<string>>();
      if (recentKeys.length) {
        const { data: cross } = await c.from("events").select("anonymous_visitor_key, business_id").eq("event_type", "interaction").in("anonymous_visitor_key", recentKeys).gte("occurred_at", new Date(now - 90 * DAY).toISOString()).limit(5000);
        for (const x of cross ?? []) {
          if (!x.anonymous_visitor_key || !x.business_id) continue;
          otherBiz.set(x.anonymous_visitor_key, (otherBiz.get(x.anonymous_visitor_key) ?? new Set()).add(x.business_id));
        }
      }
      const d30 = new Date(now - 30 * DAY).toISOString();
      const recentTaps = recent.map((e) => {
        const k = vk(e);
        if (!k) return { id: e.id, at: e.occurred_at, source: e.source_type, destination: e.destination_type, visitor: "No visitor signal", taps30d: null, firstSeen: null, lastSeen: null, sameBusinessRepeat: null, otherBusinesses: null };
        const same = allEvents.filter((x) => vk(x) === k);
        const fs = firstSeen.get(k)!;
        return {
          id: e.id,
          at: e.occurred_at,
          source: e.source_type,
          destination: e.destination_type,
          visitor: fs < e.occurred_at ? "Returning anonymous visitor" : "First seen",
          taps30d: same.filter((x) => x.occurred_at >= d30).length,
          firstSeen: fs,
          lastSeen: lastSeen.get(k)!,
          sameBusinessRepeat: same.length > 1,
          otherBusinesses: Math.max(0, (otherBiz.get(e.anonymous_visitor_key!)?.size ?? 1) - (e.business_id ? 1 : 0)),
        };
      });
      const signals = {
        uniques,
        returning,
        repeatRate,
        keyedShare: events.length ? Math.round((keyedNow.length / events.length) * 100) : 0,
        prevUniques: new Set(prevEvents.map(vk).filter(Boolean)).size,
        lift,
        recentTaps,
      };

      /* ---- Instagram intelligence ---- */
      type SP = { id: string; username: string; profile_url: string; scope: string; verification_status: string; source: string; evidence: Record<string, unknown> | null; last_checked_at: string };
      const spList = ((socials as { data: unknown }).data ?? []) as SP[];
      const own = spList.find((s) => s.scope !== "contributor") ?? null;
      const latestScope = (scope: string) => [...fList].reverse().find((f) => f.data_scope === scope) ?? null;
      const pub = single ? latestScope("public_profile") : null;
      const conn = single ? latestScope("connected_account") : null;
      const igSeries = (m: string) => snapList.filter((s) => s.metric_type === m);
      const dayVsBaseline = (m: string, t: number) => {
        const series = igSeries(m);
        const day = new Date(t).toISOString().slice(0, 10);
        const onDay = series.filter((s) => s.captured_at.slice(0, 10) === day);
        const base = series.filter((s) => { const x = new Date(s.captured_at).getTime(); return x < t - DAY / 2 && x >= t - 8 * DAY; });
        if (!onDay.length || !base.length) return null;
        const v = onDay.reduce((a, s) => a + s.metric_value, 0);
        const b = Math.round(base.reduce((a, s) => a + s.metric_value, 0) / base.length);
        return { metric: m, label: IG_METRICS[m] ?? m, value: v, baseline: b, delta: v - b };
      };
      const igTapWindows = single
        ? [...igTaps].reverse().slice(0, 5).map((t) => {
            const at = new Date(t.occurred_at).getTime();
            const before = fList.filter((f) => f.captured_at <= t.occurred_at).pop();
            const after = fList.find((f) => { const x = new Date(f.captured_at).getTime(); return x > at && x <= at + DAY; });
            const followerChange = before && after ? { previous: before.followers_count, current: after.followers_count, hours: Math.max(1, Math.round((new Date(after.captured_at).getTime() - at) / 3_600_000)), source: after.data_scope } : null;
            const insights = ["ig_profile_visits", "ig_reach", "ig_views", "ig_total_interactions", "ig_link_clicks"].map((m) => dayVsBaseline(m, at)).filter(Boolean) as NonNullable<ReturnType<typeof dayVsBaseline>>[];
            return { eventId: t.id, at: t.occurred_at, source: t.source_type, followerChange, insights };
          })
        : [];
      const contributors = spList.filter((s) => s.scope === "contributor").map((s) => {
        const e = s.evidence ?? {};
        const n = (k: string) => (Number.isFinite(Number(e[k])) && e[k] != null ? Number(e[k]) : null);
        const fol = n("followers_count");
        const postUrl = (e["post_url"] as string) ?? null;
        let level: Amp = "Standard";
        if (postUrl && (fol ?? 0) >= 10_000) level = "High amplification potential";
        else if (postUrl && (fol ?? 0) >= 1_000) level = "Elevated amplification potential";
        return {
          id: s.id,
          username: s.username,
          profileUrl: s.profile_url,
          followers: fol,
          following: n("follows_count"),
          media: n("media_count"),
          postUrl,
          mentionType: (e["mention_type"] as string) ?? null,
          checkedAt: s.last_checked_at,
          level,
          why: postUrl ? `Public ${String(e["mention_type"] ?? "post")} about this business by an account with ${fol?.toLocaleString() ?? "unknown"} followers` : "No public post/tag/mention recorded — following alone doesn't raise amplification",
        };
      });
      const instagram = {
        profile: own ? { username: own.username, url: own.profile_url, verification: own.verification_status, source: own.source } : null,
        publicProfile: pub ? { followers: pub.followers_count, follows: pub.follows_count, media: pub.media_count, at: pub.captured_at, source: pub.source } : null,
        connectedAccount: conn ? { followers: conn.followers_count, at: conn.captured_at, dailySnapshots: fList.filter((f) => f.data_scope === "connected_account" && f.captured_at >= since).length } : null,
        tapWindows: igTapWindows,
        contributors,
      };

      /* ---- Financial value engine v2 ---- */
      type O = { outcome_type: string; attribution_type: string; value: number | null; occurred_at: string };
      const oList = (outs.data ?? []) as O[];
      const direct = oList.filter((o) => o.attribution_type === "direct");
      const confirmedValued = direct.filter((o) => Number(o.value) > 0);
      const confirmed = {
        total: Math.round(confirmedValued.reduce((a, o) => a + Number(o.value), 0)),
        count: confirmedValued.length,
        unvalued: direct.length - confirmedValued.length,
      };
      const latest = (m: string) => {
        const v = snapList.filter((s) => s.metric_type === m).pop();
        return v ? Number(v.metric_value) : null;
      };
      const atv = single ? latest("avg_transaction_value") : null;
      const conv = single ? latest("conversion_rate") : null;
      const clv = single ? latest("customer_lifetime_value") : null;
      const relevant = reviewTaps.length + igTaps.length;
      const gbpIncr = actionDelta != null && actionDelta > 0 ? actionDelta : 0;
      const igLink = ig.find((g) => g.metric === "ig_link_clicks");
      const igIncr = igLink && igLink.hasBefore && igLink.after > igLink.before ? igLink.after - igLink.before : 0;
      const correlatedCount = oList.filter((o) => o.attribution_type === "correlated").length;
      let assisted: { low: number; high: number; early: boolean; assumptions: string[] } | null = null;
      if (atv && conv && conv > 0 && conv <= 1 && events.length > 0) {
        const funnel = Math.max(events.length, gbpIncr + igIncr);
        const conversions = Math.max(0, Math.max(funnel * conv, correlatedCount) - direct.length);
        const early = events.length < 10;
        const base = conversions * atv;
        const assumptions = [
          `${events.length} TapLocal taps/scans observed (${relevant} to reviews/Instagram)`,
          `Incremental Google actions vs previous period: ${gbpIncr ? `+${gbpIncr}` : "none measured"} · Instagram link clicks: ${igIncr ? `+${igIncr}` : "none measured"}`,
          "Taps and incremental Google/Instagram actions overlap (same customer journey), so only the larger of the two is counted — never both",
          `Conversion rate ${Math.round(conv * 100)}% · average transaction $${atv.toFixed(2)} (entered for this business)`,
          `${correlatedCount} attributed (correlated) outcomes used as a floor; ${direct.length} confirmed conversions removed so they aren't counted twice`,
          early ? "Fewer than 10 taps: early range, low end is 25% of the model" : "Low end halves the model to allow for customers who would have come anyway",
        ];
        if (clv) assumptions.push(`Customer lifetime value $${clv.toFixed(2)} recorded — not used, to stay conservative`);
        assisted = { low: Math.round(base * (early ? 0.25 : 0.5)), high: Math.round(base), early, assumptions };
      }
      const igGrowth = ig.filter((g) => g.hasBefore && g.after !== g.before).map((g) => `${IG_METRICS[g.metric]} ${g.before.toLocaleString()} → ${g.after.toLocaleString()}`);
      const visibility = [
        newReviews ? `${newReviews} new Google review${newReviews > 1 ? "s" : ""}` : null,
        rating && rating.current !== rating.previous ? `Rating ${rating.previous.toFixed(1)} → ${rating.current.toFixed(1)}` : null,
        gbp.length ? (visUp ? "Google search/Maps impressions up vs previous period" : "No Google impressions increase") : null,
        prominentGains ? `${prominentGains} Google photo prominence gain${prominentGains > 1 ? "s" : ""}` : null,
        followersKnown ? `${gained >= 0 ? "+" : ""}${gained} Instagram followers` : null,
        ...igGrowth,
      ].filter(Boolean) as string[];
      const opportunity = assisted ? { low: assisted.low, high: assisted.high, assumptions: assisted.assumptions } : null;

      const elevated = reviewRows.filter((r) => r.reach !== "Standard").length;
      const linked = reviewRows.filter((r) => r.badge === "INFERRED").length;
      const confidence =
        assisted && !assisted.early && events.length >= 30 && linked >= 3 ? "Medium" : assisted || linked > 0 || gained > 0 || countGrowth > 0 ? "Low" : "Not enough data";
      const igAmp = contributors.filter((x) => x.level !== "Standard").length;

      /* ---- Evidence chain ---- */
      const timeline: { stage: string; badge: Badge; detail: string; measured: boolean }[] = [
        { stage: "Tap/Scan", badge: "OBSERVED", measured: events.length > 0, detail: `${events.length} taps/scans (${prevEvents.length} in the previous period)` },
        { stage: "Destination opened", badge: "OBSERVED", measured: relevant > 0, detail: `${reviewTaps.length} to Google Reviews · ${igTaps.length} to Instagram` },
        { stage: "Review / follower change", badge: linked ? "INFERRED" : "EXTERNAL", measured: newReviews > 0 || followersKnown, detail: `${newReviews} new reviews${followersKnown ? ` · ${gained >= 0 ? "+" : ""}${gained} followers` : " · followers unavailable"}${linked ? ` · ${linked} within 24h of a review tap` : ""}` },
        { stage: "Contributor/audience strength", badge: "EXTERNAL", measured: elevated + igAmp > 0, detail: elevated + igAmp ? `${elevated} elevated Google reviewer${elevated === 1 ? "" : "s"} · ${igAmp} Instagram contributor${igAmp === 1 ? "" : "s"} with public reach` : "No high-reach evidence recorded" },
        { stage: "Google/Instagram amplification", badge: photoChanges.some((p) => p.badge === "CONFIRMED") ? "CONFIRMED" : "EXTERNAL", measured: photoChanges.length > 0 || igGrowth.length > 0, detail: photoChanges.length || igGrowth.length ? `${prominentGains} photo prominence gains${igGrowth.length ? ` · ${igGrowth.join(" · ")}` : ""}` : "No amplification data recorded" },
        { stage: "Organic visibility", badge: "INFERRED", measured: gbp.length > 0, detail: gbp.length ? (visUp ? "Visibility increased after this result — possible contribution, not confirmed." : "No visibility increase vs the previous period") : "Google performance data not connected." },
        { stage: "Return/referral signals", badge: "INFERRED", measured: uniques > 0, detail: uniques ? `${uniques} est. unique anonymous visitors · ${returning} returning${lift ? ` · new visitors ${lift.before} → ${lift.after} around first outcome` : ""}` : "No anonymous visitor signal" },
        { stage: "Calls/directions/profile/link actions", badge: "EXTERNAL", measured: actionDelta != null || Boolean(igLink), detail: actionDelta != null || igLink ? `${actionDelta != null ? `Google ${actionDelta >= 0 ? "+" : ""}${actionDelta}` : "Google not measured"}${igLink ? ` · IG link clicks ${igLink.hasBefore ? `${igLink.before} → ` : ""}${igLink.after}` : ""} vs previous period` : "Not measured" },
        { stage: "Confirmed conversions", badge: "CONFIRMED", measured: direct.length > 0, detail: direct.length ? `${direct.length} directly tracked${confirmed.total ? ` · $${confirmed.total.toLocaleString()}` : ""}` : "None directly tracked" },
        { stage: "Financial opportunity", badge: "INFERRED", measured: Boolean(assisted), detail: assisted ? `$${assisted.low.toLocaleString()}–$${assisted.high.toLocaleString()} modelled${assisted.early ? " (early range)" : ""}` : "Needs this business's average sale and conversion rate." },
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
        instagram,
        signals,
        financial: { confirmed, assisted, visibility, hasInputs: Boolean(atv && conv) },
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

/** Admin records Instagram counts read from the public professional profile or the connected account (never scraped). */
export const recordFollowerCount = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      businessId: z.string().uuid(),
      followers: z.number().int().min(0).max(1_000_000_000),
      follows: z.number().int().min(0).max(1_000_000_000).nullable().default(null),
      media: z.number().int().min(0).max(10_000_000).nullable().default(null),
      dataScope: z.enum(["public_profile", "connected_account"]).default("public_profile"),
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
      .neq("scope", "contributor")
      .limit(1)
      .maybeSingle();
    const { error } = await c.from("social_follower_snapshots").insert({
      business_id: data.businessId,
      social_profile_id: profile?.id ?? null,
      followers_count: data.followers,
      follows_count: data.follows,
      media_count: data.media,
      data_scope: data.dataScope,
      source: data.source,
    });
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

/** Admin records a public Instagram Business/Creator account that publicly posted/tagged/mentioned the business. */
export const recordInstagramContributor = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      businessId: z.string().uuid(),
      username: z.string().trim().regex(/^@?[A-Za-z0-9._]{1,30}$/),
      followers: z.number().int().min(0).max(1_000_000_000).nullable(),
      follows: z.number().int().min(0).max(1_000_000_000).nullable(),
      media: z.number().int().min(0).max(10_000_000).nullable(),
      postUrl: z.string().url().max(500).nullable(),
      mentionType: z.enum(["post", "tag", "mention", "reel", "story"]).default("post"),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/admin-auth.server");
    const a = await requireAdmin();
    if (!a.ok) return { ok: false as const, error: a.error };
    const { supabaseAdmin: c } = await import("@/integrations/supabase/client.server");
    const username = data.username.replace(/^@/, "").toLowerCase();
    const { error } = await c.from("business_social_profiles").insert({
      business_id: data.businessId,
      platform: "instagram",
      username,
      profile_url: `https://www.instagram.com/${username}/`,
      scope: "contributor",
      confidence: 100,
      verification_status: "manual",
      source: "admin_verified",
      verified_at: new Date().toISOString(),
      verified_by_user_id: a.userId,
      evidence: { followers_count: data.followers, follows_count: data.follows, media_count: data.media, post_url: data.postUrl, mention_type: data.mentionType } as never,
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
