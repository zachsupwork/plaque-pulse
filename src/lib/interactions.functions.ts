import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { REPORT_TIMEZONE, startOfTodayInTimezone, startOfWindowInTimezone } from "@/lib/report-time";

/**
 * Interaction intelligence for the platform-owner console.
 *
 * Customer numbers come from ONE feed and one feed only: event_type =
 * 'interaction' with an nfc or qr source. Manufacturing tests, setup opens,
 * taps while paused and redirect telemetry are deliberately excluded, so a
 * single tap can never be counted twice.
 */

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function scopeFor(client: Awaited<ReturnType<typeof db>>) {
  const { getDemoScope } = await import("@/lib/admin-scope.server");
  return getDemoScope(client as never);
}

const INTERACTION_SELECT =
  "id, business_id, plaque_id, location_id, source_type, destination_type, destination_id, intent_type, device_family, browser_family, coarse_country, coarse_region, anonymous_visitor_key, occurred_at, metadata";

/** Today's live numbers plus the newest taps and scans. Never a false zero. */
export const liveTapFeed = createServerFn({ method: "POST" }).handler(async () => {
  const caller = await gate();
  if (!caller.ok) return { ok: false as const, error: caller.error };

  try {
    const client = await db();
    const scope = await scopeFor(client);
    const todayStart = startOfTodayInTimezone();

    const { data: rows, error } = await client
      .from("events")
      .select(INTERACTION_SELECT)
      .eq("event_type", "interaction")
      .gte("occurred_at", startOfWindowInTimezone(2))
      .order("occurred_at", { ascending: false })
      .limit(2000);
    if (error) throw error;

    const real = (rows ?? []).filter((e) => !scope.isDemoRow(e));
    const today = real.filter((e) => e.occurred_at >= todayStart);
    const nfc = today.filter((e) => e.source_type === "nfc").length;
    const qr = today.filter((e) => e.source_type === "qr").length;

    const latest = real.slice(0, 10);
    const businessIds = [...new Set(latest.map((e) => e.business_id).filter(Boolean))] as string[];
    const plaqueIds = [...new Set(latest.map((e) => e.plaque_id).filter(Boolean))] as string[];

    const [{ data: businesses }, { data: plaques }] = await Promise.all([
      businessIds.length ? client.from("businesses").select("id, name").in("id", businessIds) : { data: [] },
      plaqueIds.length
        ? client.from("plaques").select("id, plaque_code, plaque_name, placement_type, public_slug").in("id", plaqueIds)
        : { data: [] },
    ]);
    const bizName = new Map((businesses ?? []).map((b) => [b.id, b.name]));
    const plaqueMap = new Map((plaques ?? []).map((p) => [p.id, p]));

    const eventIds = latest.map((e) => e.id);
    const { data: candidates } = eventIds.length
      ? await client.from("attribution_candidates").select("event_id, confidence").in("event_id", eventIds)
      : { data: [] };
    const bestByEvent = new Map<string, number>();
    for (const c of candidates ?? []) {
      const current = bestByEvent.get(c.event_id) ?? 0;
      if (c.confidence > current) bestByEvent.set(c.event_id, c.confidence);
    }

    return {
      ok: true as const,
      timezone: REPORT_TIMEZONE,
      today: { total: today.length, nfc, qr, consistent: today.length === nfc + qr },
      lastInteraction: real[0]?.occurred_at ?? null,
      lastNfc: real.find((e) => e.source_type === "nfc")?.occurred_at ?? null,
      lastQr: real.find((e) => e.source_type === "qr")?.occurred_at ?? null,
      latest: latest.map((e) => ({
        id: e.id,
        at: e.occurred_at,
        source: e.source_type === "qr" ? "QR SCAN" : "NFC TAP",
        business: e.business_id ? (bizName.get(e.business_id) ?? "Unassigned") : "Unassigned",
        businessId: e.business_id,
        plaque: e.plaque_id
          ? (plaqueMap.get(e.plaque_id)?.plaque_name ?? plaqueMap.get(e.plaque_id)?.plaque_code ?? "")
          : "",
        placement: e.plaque_id ? (plaqueMap.get(e.plaque_id)?.placement_type ?? "") : "",
        destination: e.destination_type ?? null,
        device: e.device_family ?? null,
        bestConfidence: bestByEvent.get(e.id) ?? null,
      })),
    };
  } catch {
    // A read failure must never look like "no taps happened".
    return { ok: false as const, error: "unavailable" as const };
  }
});

const filterSchema = z.object({
  days: z.number().int().min(1).max(365).default(30),
  source: z.enum(["all", "nfc", "qr"]).default("all"),
  period: z.enum(["today", "window"]).default("window"),
  businessId: z.string().uuid().nullable().default(null),
  plaqueId: z.string().uuid().nullable().default(null),
  placement: z.string().max(60).default("all"),
  destination: z.string().max(60).default("all"),
  device: z.string().max(60).default("all"),
  attribution: z.enum(["any", "has", "none"]).default("any"),
  minConfidence: z.number().int().min(0).max(100).default(0),
  limit: z.number().int().min(1).max(500).default(100),
});

/** Filtered interaction list behind the analytics screen. Every row is clickable. */
export const listInteractions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => filterSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, rows: [], facets: null };

    const client = await db();
    const scope = await scopeFor(client);
    const from = data.period === "today" ? startOfTodayInTimezone() : startOfWindowInTimezone(data.days);

    let request = client
      .from("events")
      .select(INTERACTION_SELECT)
      .eq("event_type", "interaction")
      .gte("occurred_at", from)
      .order("occurred_at", { ascending: false })
      .limit(5000);
    if (data.source !== "all") request = request.eq("source_type", data.source);
    if (data.businessId) request = request.eq("business_id", data.businessId);
    if (data.plaqueId) request = request.eq("plaque_id", data.plaqueId);
    if (data.destination !== "all") request = request.eq("destination_type", data.destination as never);
    if (data.device !== "all") request = request.eq("device_family", data.device);

    const { data: rows } = await request;
    const real = (rows ?? []).filter((e) => !scope.isDemoRow(e));

    const plaqueIds = [...new Set(real.map((e) => e.plaque_id).filter(Boolean))] as string[];
    const businessIds = [...new Set(real.map((e) => e.business_id).filter(Boolean))] as string[];
    const [{ data: plaques }, { data: businesses }] = await Promise.all([
      plaqueIds.length
        ? client.from("plaques").select("id, plaque_code, plaque_name, placement_type, public_slug").in("id", plaqueIds)
        : { data: [] },
      businessIds.length ? client.from("businesses").select("id, name").in("id", businessIds) : { data: [] },
    ]);
    const plaqueMap = new Map((plaques ?? []).map((p) => [p.id, p]));
    const bizName = new Map((businesses ?? []).map((b) => [b.id, b.name]));

    const placementFiltered =
      data.placement === "all"
        ? real
        : real.filter((e) => (e.plaque_id ? plaqueMap.get(e.plaque_id)?.placement_type : null) === data.placement);

    const eventIds = placementFiltered.slice(0, 1000).map((e) => e.id);
    const { data: candidates } = eventIds.length
      ? await client
          .from("attribution_candidates")
          .select("event_id, kind, badge, confidence, headline")
          .in("event_id", eventIds)
      : { data: [] };
    const byEvent = new Map<string, { count: number; best: number; headline: string; badge: string }>();
    for (const c of candidates ?? []) {
      const cur = byEvent.get(c.event_id);
      if (!cur || c.confidence > cur.best) {
        byEvent.set(c.event_id, {
          count: (cur?.count ?? 0) + 1,
          best: c.confidence,
          headline: c.headline,
          badge: c.badge,
        });
      } else {
        cur.count += 1;
      }
    }

    const withAttribution = placementFiltered.filter((e) => {
      const a = byEvent.get(e.id);
      if (data.attribution === "has" && !a) return false;
      if (data.attribution === "none" && a) return false;
      if (data.minConfidence > 0 && (a?.best ?? 0) < data.minConfidence) return false;
      return true;
    });

    return {
      ok: true as const,
      total: withAttribution.length,
      rows: withAttribution.slice(0, data.limit).map((e) => {
        const a = byEvent.get(e.id) ?? null;
        return {
          id: e.id,
          at: e.occurred_at,
          source: e.source_type === "qr" ? "QR" : "NFC",
          business: e.business_id ? (bizName.get(e.business_id) ?? "Unassigned") : "Unassigned",
          plaque: e.plaque_id
            ? (plaqueMap.get(e.plaque_id)?.plaque_name ?? plaqueMap.get(e.plaque_id)?.plaque_code ?? "")
            : "",
          slug: e.plaque_id ? (plaqueMap.get(e.plaque_id)?.public_slug ?? "") : "",
          placement: e.plaque_id ? (plaqueMap.get(e.plaque_id)?.placement_type ?? null) : null,
          destination: e.destination_type ?? null,
          device: e.device_family ?? null,
          attribution: a ? { count: a.count, best: a.best, headline: a.headline, badge: a.badge } : null,
        };
      }),
      facets: {
        placements: [...new Set((plaques ?? []).map((p) => p.placement_type).filter(Boolean))] as string[],
        destinations: [...new Set(real.map((e) => e.destination_type).filter(Boolean))] as string[],
        devices: [...new Set(real.map((e) => e.device_family).filter(Boolean))] as string[],
        businesses: (businesses ?? []).map((b) => ({ id: b.id, name: b.name })),
      },
    };
  });

/** Everything TapLocal observed about ONE tap, plus the AI analysis around it. */
export const getInteraction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ eventId: z.string().uuid(), refresh: z.boolean().default(false) }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, interaction: null };

    const client = await db();
    const { data: event } = await client
      .from("events")
      .select(`${INTERACTION_SELECT}, event_type`)
      .eq("id", data.eventId)
      .maybeSingle();
    if (!event) return { ok: true as const, interaction: null };

    const [business, plaque, location, destination] = await Promise.all([
      event.business_id
        ? client.from("businesses").select("id, name, industry").eq("id", event.business_id).maybeSingle()
        : Promise.resolve({ data: null }),
      event.plaque_id
        ? client
            .from("plaques")
            .select("id, plaque_code, public_slug, plaque_name, placement_type, status")
            .eq("id", event.plaque_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      event.location_id
        ? client.from("locations").select("id, name, address, city, google_place_id").eq("id", event.location_id).maybeSingle()
        : Promise.resolve({ data: null }),
      event.destination_id
        ? client.from("destinations").select("id, destination_type, url").eq("id", event.destination_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // Other anonymous activity that shares the same session key — never an identity.
    const { data: related } = event.anonymous_visitor_key
      ? await client
          .from("events")
          .select("id, event_type, source_type, occurred_at, business_id")
          .eq("anonymous_visitor_key", event.anonymous_visitor_key)
          .neq("id", event.id)
          .order("occurred_at", { ascending: false })
          .limit(10)
      : { data: [] };

    // Was the redirect itself recorded as successful?
    const { data: telemetry } = await client
      .from("events")
      .select("event_type, occurred_at")
      .eq("plaque_id", event.plaque_id ?? "00000000-0000-0000-0000-000000000000")
      .in("event_type", ["redirect_success", "redirect_failure"])
      .gte("occurred_at", event.occurred_at)
      .lte("occurred_at", new Date(new Date(event.occurred_at).getTime() + 60000).toISOString())
      .limit(1);

    if (data.refresh) {
      const { analyzeInteraction } = await import("@/lib/attribution.server");
      if (event.business_id) {
        const { syncListingSignals } = await import("@/lib/attribution.server");
        await syncListingSignals(client as never, event.business_id);
      }
      await analyzeInteraction(client as never, event.id);
    }

    const { data: candidates } = await client
      .from("attribution_candidates")
      .select("id, kind, badge, confidence, headline, detail, evidence, external_ref, occurred_at, status")
      .eq("event_id", event.id)
      .order("confidence", { ascending: false });

    return {
      ok: true as const,
      interaction: {
        id: event.id,
        eventType: event.event_type,
        occurredAt: event.occurred_at,
        source: event.source_type === "qr" ? "QR scan" : event.source_type === "nfc" ? "NFC tap" : "Not recorded",
        sourceType: event.source_type,
        intent: event.intent_type,
        deviceFamily: event.device_family,
        browserFamily: event.browser_family,
        coarseCountry: event.coarse_country,
        coarseRegion: event.coarse_region,
        anonymousKey: event.anonymous_visitor_key,
        metadata: event.metadata,
        business: business.data,
        plaque: plaque.data,
        location: location.data,
        destination: destination.data,
        destinationType: event.destination_type,
        redirectResult: (telemetry ?? [])[0]?.event_type ?? null,
        relatedActivity: (related ?? []).map((r) => ({
          id: r.id,
          type: r.event_type,
          source: r.source_type,
          at: r.occurred_at,
          sameBusiness: r.business_id === event.business_id,
        })),
        candidates: candidates ?? [],
      },
    };
  });

/** Re-run the analysis for one tap on demand. */
export const refreshInteractionAnalysis = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ eventId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();
    const { analyzeInteraction, syncListingSignals } = await import("@/lib/attribution.server");

    const { data: event } = await client.from("events").select("id, business_id").eq("id", data.eventId).maybeSingle();
    if (!event) return { ok: false as const, error: "not_found" as const };

    const listing = event.business_id ? await syncListingSignals(client as never, event.business_id) : null;
    const result = await analyzeInteraction(client as never, event.id);
    return { ok: true as const, listing, candidates: result.candidates.length };
  });

/** "TapLocal AI — today": what happened, and what may have come of it. */
export const aiToday = createServerFn({ method: "POST" }).handler(async () => {
  const caller = await gate();
  if (!caller.ok) return { ok: false as const, error: caller.error };

  try {
    const client = await db();
    const scope = await scopeFor(client);
    const todayStart = startOfTodayInTimezone();

    const { data: rows } = await client
      .from("events")
      .select("id, business_id, plaque_id, source_type, occurred_at")
      .eq("event_type", "interaction")
      .gte("occurred_at", todayStart)
      .limit(5000);
    const real = (rows ?? []).filter((e) => !scope.isDemoRow(e));

    const [{ data: candidates }, { data: photos }] = await Promise.all([
      client
        .from("attribution_candidates")
        .select("id, event_id, kind, confidence, headline, occurred_at, business_id")
        .gte("occurred_at", todayStart)
        .order("confidence", { ascending: false })
        .limit(200),
      client
        .from("maps_photo_observations")
        .select("id, business_id, status, previous_status, status_changed_at, contributor_name")
        .gte("status_changed_at", todayStart)
        .limit(200),
    ]);

    const realCandidates = (candidates ?? []).filter((c) => !scope.isDemoRow(c));
    const realPhotos = (photos ?? []).filter((p) => !scope.isDemoRow(p));
    const top = realCandidates[0] ?? null;

    return {
      ok: true as const,
      timezone: REPORT_TIMEZONE,
      interactions: real.length,
      nfc: real.filter((e) => e.source_type === "nfc").length,
      qr: real.filter((e) => e.source_type === "qr").length,
      possibleReviews: realCandidates.filter((c) => c.kind === "google_review").length,
      newPhotos: realPhotos.filter((p) => !p.previous_status).length,
      enteredTop3: realPhotos.filter((p) => p.status === "top_3" || p.status === "main_photo").length,
      latest: top
        ? {
            eventId: top.event_id,
            headline: top.headline,
            confidence: top.confidence,
            at: top.occurred_at,
          }
        : null,
    };
  } catch {
    return { ok: false as const, error: "unavailable" as const };
  }
});
