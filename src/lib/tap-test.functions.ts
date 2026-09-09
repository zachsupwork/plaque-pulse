import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Server-side tap verification.
 *
 * Safari cannot read an NFC chip from a web page, so an iPhone admin proves a
 * plaque works the other way round: they tap it, the tag opens the TapLocal
 * managed link, and the server records the visit. This confirms the tap
 * reached the expected TapLocal URL — it never reads the chip's memory.
 */

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type TapEvent = {
  occurredAt: string;
  source: "nfc" | "qr" | null;
  device: string | null;
  test: boolean;
};

/** Everything the NFC plaque panel shows, in one call. */
export const getPlaqueNfcStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, status: null };

    const client = await db();
    const { data: plaque } = await client
      .from("plaques")
      .select("id, plaque_code, public_slug, status, business_id, location_id")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const, status: null };

    const [{ data: destination }, { data: programming }, { data: taps }] = await Promise.all([
      client
        .from("destinations")
        .select("destination_type, url")
        .eq("plaque_id", plaque.id)
        .is("effective_to", null)
        .eq("active", true)
        .maybeSingle(),
      client
        .from("plaque_programming")
        .select("write_status, verification_status, verified_at")
        .eq("plaque_id", plaque.id)
        .maybeSingle(),
      client
        .from("events")
        .select("occurred_at, source_type, device_family, event_type")
        .eq("plaque_id", plaque.id)
        .in("event_type", ["interaction", "manufacturing_test"])
        .order("occurred_at", { ascending: false })
        .limit(1),
    ]);

    const location = plaque.location_id
      ? (
          await client
            .from("locations")
            .select("google_review_url")
            .eq("id", plaque.location_id)
            .maybeSingle()
        ).data
      : null;

    const lastTap = taps?.[0]
      ? {
          occurredAt: taps[0].occurred_at,
          source: (taps[0].source_type as "nfc" | "qr" | null) ?? null,
          device: taps[0].device_family,
          test: taps[0].event_type === "manufacturing_test",
        }
      : null;

    return {
      ok: true as const,
      error: null,
      status: {
        plaqueId: plaque.id,
        plaqueCode: plaque.plaque_code,
        publicSlug: plaque.public_slug,
        /** The database switch an admin controls, on any device. */
        enabled: plaque.status !== "paused",
        plaqueStatus: plaque.status,
        writeStatus: programming?.write_status ?? null,
        verificationStatus: programming?.verification_status ?? null,
        destinationType: destination?.destination_type ?? null,
        destinationUrl: destination?.url ?? null,
        googleReviewUrl: location?.google_review_url ?? null,
        lastTap,
      },
    };
  });

/** Open a short verification window; the admin then taps the plaque. */
export const startTapTest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, startedAt: null, expiresAt: null };
    void data;
    const startedAt = new Date();
    return {
      ok: true as const,
      error: null,
      startedAt: startedAt.toISOString(),
      expiresAt: new Date(startedAt.getTime() + 60_000).toISOString(),
    };
  });

/** Has this plaque been tapped since the window opened? */
export const checkTapTest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ plaqueId: z.string().uuid(), since: z.string().min(10).max(40) }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, tap: null };

    const client = await db();
    const { data: rows } = await client
      .from("events")
      .select("occurred_at, source_type, device_family, event_type")
      .eq("plaque_id", data.plaqueId)
      .in("event_type", ["interaction", "manufacturing_test"])
      .gte("occurred_at", data.since)
      .order("occurred_at", { ascending: false })
      .limit(1);

    const row = rows?.[0];
    const tap: TapEvent | null = row
      ? {
          occurredAt: row.occurred_at,
          source: (row.source_type as "nfc" | "qr" | null) ?? null,
          device: row.device_family,
          test: row.event_type === "manufacturing_test",
        }
      : null;

    return { ok: true as const, error: null, tap };
  });

/** Enable or disable the plaque's live destination — a database switch, no hardware involved. */
export const setPlaqueEnabled = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ plaqueId: z.string().uuid(), enabled: z.boolean() }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };

    const client = await db();
    const { data: plaque } = await client
      .from("plaques")
      .select("id, business_id, status")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const };

    const next = data.enabled ? "active" : "paused";
    await client.from("plaques").update({ status: next }).eq("id", plaque.id);

    if (plaque.business_id) {
      await client.from("action_history").insert({
        business_id: plaque.business_id,
        plaque_id: plaque.id,
        action_type: data.enabled ? "plaque_enabled" : "plaque_disabled",
        previous_value: { status: plaque.status },
        new_value: { status: next },
        initiated_by: "admin",
        approved_by_user_id: caller.userId,
      });
    }

    return { ok: true as const, error: null };
  });

/** Tracking diagnostics for one plaque — proves taps are being persisted. */
export const getPlaqueTracking = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, tracking: null };

    const client = await db();
    const { data: plaque } = await client
      .from("plaques")
      .select("id, plaque_code, public_slug, status, business_id, location_id")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const, tracking: null };

    const [{ data: destination }, { data: business }, { data: events }] = await Promise.all([
      client
        .from("destinations")
        .select("destination_type, url")
        .eq("plaque_id", plaque.id)
        .is("effective_to", null)
        .eq("active", true)
        .maybeSingle(),
      plaque.business_id
        ? client.from("businesses").select("id, name").eq("id", plaque.business_id).maybeSingle()
        : Promise.resolve({ data: null }),
      client
        .from("events")
        .select("event_type, source_type, occurred_at")
        .eq("plaque_id", plaque.id)
        .order("occurred_at", { ascending: false })
        .limit(2000),
    ]);

    const rows = events ?? [];
    const { startOfTodayInTimezone, REPORT_TIMEZONE } = await import("@/lib/report-time");
    // Local reporting day, never a UTC day — an 11 PM Ottawa tap belongs to today.
    const todayIso = startOfTodayInTimezone();
    const interactions = rows.filter((e) => e.event_type === "interaction");
    const today = interactions.filter((e) => e.occurred_at >= todayIso);
    const lastOf = (predicate: (e: (typeof rows)[number]) => boolean) =>
      rows.find(predicate)?.occurred_at ?? null;

    return {
      ok: true as const,
      error: null,
      tracking: {
        timezone: REPORT_TIMEZONE,
        plaqueCode: plaque.plaque_code,
        publicSlug: plaque.public_slug,
        status: plaque.status,
        business: business?.name ?? null,
        businessAssigned: Boolean(plaque.business_id),
        locationAssigned: Boolean(plaque.location_id),
        destinationType: destination?.destination_type ?? null,
        destinationUrl: destination?.url ?? null,
        lastNfcTap: lastOf((e) => e.event_type === "interaction" && e.source_type === "nfc"),
        lastQrScan: lastOf((e) => e.event_type === "interaction" && e.source_type === "qr"),
        lastInteraction: lastOf((e) => e.event_type === "interaction"),
        lastEvent: rows[0] ? { type: rows[0].event_type, at: rows[0].occurred_at } : null,
        eventsToday: rows.filter((e) => e.occurred_at >= todayIso).length,
        interactionsToday: today.length,
        nfcToday: today.filter((e) => e.source_type === "nfc").length,
        qrToday: today.filter((e) => e.source_type === "qr").length,
        interactionsAllTime: interactions.length,
        nfcAllTime: interactions.filter((e) => e.source_type === "nfc").length,
        qrAllTime: interactions.filter((e) => e.source_type === "qr").length,
        testEvents: rows.filter((e) => e.event_type === "manufacturing_test").length,
        setupOpens: rows.filter((e) => e.event_type === "setup_open").length,
        inactiveTaps: rows.filter((e) => e.event_type === "inactive_tap").length,
      },
    };
  });

export type TrackingCheckLine = { label: string; ok: boolean; detail: string };

/**
 * End-to-end tracking check for one plaque.
 *
 * Every probe uses the excluded `tl_test=1` flag or writes an explicitly
 * diagnostic event, so running this never inflates customer analytics.
 */
export const runTrackingCheck = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, checks: [] as TrackingCheckLine[] };

    const client = await db();
    const checks: TrackingCheckLine[] = [];
    const add = (label: string, passed: boolean, detail: string) => checks.push({ label, ok: passed, detail });

    const { data: plaque } = await client
      .from("plaques")
      .select("id, plaque_code, public_slug, status, business_id, location_id")
      .eq("id", data.plaqueId)
      .maybeSingle();

    if (!plaque) {
      add("Plaque exists", false, "No plaque record found");
      return { ok: true as const, error: null, checks };
    }

    add("Plaque exists", true, plaque.plaque_code);
    add("Slug resolves", Boolean(plaque.public_slug), plaque.public_slug ?? "missing");
    add("Business assigned", Boolean(plaque.business_id), plaque.business_id ? "Assigned" : "No business");
    add("Location assigned", Boolean(plaque.location_id), plaque.location_id ? "Assigned" : "No location");
    add(
      "Plaque live",
      plaque.status === "active",
      plaque.status === "paused" ? "Paused — taps record as inactive_tap" : plaque.status,
    );

    const { data: destination } = await client
      .from("destinations")
      .select("id, destination_type, url, active")
      .eq("plaque_id", plaque.id)
      .is("effective_to", null)
      .maybeSingle();
    add("Destination exists", Boolean(destination), destination?.destination_type ?? "None — taps record as setup_open");
    add("Destination active", Boolean(destination?.active && destination.url), destination?.url ?? "—");

    // Route probes carry tl_test=1, so they are never counted as customer taps.
    const { nfcUrl, qrUrl, testUrl } = await import("@/lib/smartlink");
    const probe = async (label: string, url: string) => {
      try {
        const res = await fetch(testUrl(url), { redirect: "manual" });
        add(label, res.status > 0 && res.status < 500, `HTTP ${res.status}`);
      } catch (err) {
        add(label, false, err instanceof Error ? err.message : "unreachable");
      }
    };
    await probe("/n route reachable", nfcUrl(plaque.public_slug));
    await probe("/q route reachable", qrUrl(plaque.public_slug));

    const { error: writeError } = await client.from("events").insert({
      business_id: plaque.business_id,
      plaque_id: plaque.id,
      location_id: plaque.location_id,
      event_type: "manufacturing_test",
      source_type: "nfc",
      occurred_at: new Date().toISOString(),
      metadata: { diagnostic: true, tl_test: true },
    });
    add("Events table writable", !writeError, writeError ? writeError.message : "Diagnostic event saved (not counted)");

    const { count, error: readError } = await client
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("plaque_id", plaque.id)
      .eq("event_type", "interaction");
    add("Analytics can read events", !readError, readError ? readError.message : `${count ?? 0} interactions on record`);

    return { ok: true as const, error: null, checks };
  });

