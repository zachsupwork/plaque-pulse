import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nfcUrl, sameSmartLink } from "@/lib/smartlink";
import type { Json } from "@/integrations/supabase/types";

const PLAQUE_COLUMNS =
  "id, plaque_code, public_slug, product_type, style, base_type, batch_id, plaque_name, status, business_id, activated_at";

const deviceInfo = z.record(z.string(), z.unknown()).optional();

type Forbidden = { ok: false; error: "unauthorized" | "forbidden" };

async function admin() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function ensureRow(client: Awaited<ReturnType<typeof db>>, plaqueId: string, slug: string, batchId: string | null) {
  const { data: existing } = await client
    .from("plaque_programming")
    .select("id")
    .eq("plaque_id", plaqueId)
    .maybeSingle();
  if (existing) return;
  await client.from("plaque_programming").insert({
    plaque_id: plaqueId,
    batch_id: batchId,
    expected_nfc_url: nfcUrl(slug),
  });
}

/** Whether the signed-in user may use the manufacturing tools. */
export const checkAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const caller = await admin();
  return { isAdmin: caller.ok };
});

/** Search inventory by plaque code, public slug or batch. */
export const searchPlaques = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ query: z.string().max(80).default("") }).parse(data))
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error, plaques: [] };
    const client = await db();

    let request = client.from("plaques").select(PLAQUE_COLUMNS).order("created_at", { ascending: false }).limit(25);
    const q = data.query.trim();
    if (q) request = request.or(`plaque_code.ilike.%${q}%,public_slug.ilike.%${q}%,batch_id.ilike.%${q}%`);

    const { data: plaques } = await request;
    return { ok: true as const, plaques: plaques ?? [] };
  });

/** Full manufacturing view of one plaque. */
export const getPlaqueProgramming = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ plaqueId: z.string().uuid().optional(), slug: z.string().max(40).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error, plaque: null, programming: null, business: null };
    const client = await db();

    let query = client.from("plaques").select(PLAQUE_COLUMNS);
    query = data.plaqueId ? query.eq("id", data.plaqueId) : query.eq("public_slug", data.slug ?? "");
    const { data: plaque } = await query.maybeSingle();
    if (!plaque) return { ok: true as const, plaque: null, programming: null, business: null };

    const { data: programming } = await client
      .from("plaque_programming")
      .select("*")
      .eq("plaque_id", plaque.id)
      .maybeSingle();

    let business: { id: string; name: string } | null = null;
    if (plaque.business_id) {
      const { data: biz } = await client.from("businesses").select("id, name").eq("id", plaque.business_id).maybeSingle();
      business = biz ?? null;
    }

    return { ok: true as const, plaque, programming: programming ?? null, business };
  });

const eventSchema = z.object({
  plaqueId: z.string().uuid(),
  eventType: z.enum([
    "write_started",
    "write_success",
    "write_failed",
    "read_success",
    "verification_match",
    "verification_mismatch",
    "manual_programming_confirmed",
  ]),
  expectedValue: z.string().max(500).nullish(),
  actualValue: z.string().max(500).nullish(),
  result: z.string().max(60).nullish(),
  deviceInfo,
});

/** Append to the immutable manufacturing log. */
export const logProgrammingEvent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => eventSchema.parse(data))
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();
    await client.from("programming_events").insert({
      plaque_id: data.plaqueId,
      event_type: data.eventType,
      expected_value: data.expectedValue ?? null,
      actual_value: data.actualValue ?? null,
      result: data.result ?? null,
      user_id: caller.userId,
      device_info: ((data.deviceInfo ?? {}) as unknown as Json),
    });
    return { ok: true as const };
  });

/** Record the outcome of a write attempt. */
export const setWriteStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        plaqueId: z.string().uuid(),
        status: z.enum(["not_programmed", "programming", "programmed", "failed"]),
        manual: z.boolean().optional(),
        notes: z.string().max(500).optional(),
        deviceInfo,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, public_slug, batch_id")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const };
    await ensureRow(client, plaque.id, plaque.public_slug, plaque.batch_id);

    const programmed = data.status === "programmed";
    await client
      .from("plaque_programming")
      .update({
        write_status: data.status,
        expected_nfc_url: nfcUrl(plaque.public_slug),
        programmed_at: programmed ? new Date().toISOString() : null,
        programmed_by_user_id: programmed ? caller.userId : null,
        ...(programmed && data.manual ? { verification_status: "not_verified" } : {}),
        ...(data.notes ? { notes: data.notes } : {}),
        device_info: ((data.deviceInfo ?? {}) as unknown as Json),
      })
      .eq("plaque_id", plaque.id);

    if (data.manual) {
      await client.from("programming_events").insert({
        plaque_id: plaque.id,
        event_type: "manual_programming_confirmed",
        expected_value: nfcUrl(plaque.public_slug),
        result: "manual",
        user_id: caller.userId,
        device_info: ((data.deviceInfo ?? {}) as unknown as Json),
      });
    }

    return { ok: true as const };
  });

/** Record a read-back verification result. Mismatches are never accepted silently. */
export const setVerification = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        plaqueId: z.string().uuid(),
        actualUrl: z.string().max(500),
        deviceInfo,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error, matched: false, expected: "" };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, public_slug, batch_id")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const, matched: false, expected: "" };

    const expected = nfcUrl(plaque.public_slug);
    // Host-agnostic: a tag written before the short domain went live is still correct.
    const matched = sameSmartLink(data.actualUrl.trim(), expected);
    await ensureRow(client, plaque.id, plaque.public_slug, plaque.batch_id);

    await client
      .from("plaque_programming")
      .update({
        verification_status: matched ? "verified" : "mismatch",
        verified_at: matched ? new Date().toISOString() : null,
        verified_by_user_id: matched ? caller.userId : null,
      })
      .eq("plaque_id", plaque.id);

    await client.from("programming_events").insert({
      plaque_id: plaque.id,
      event_type: matched ? "verification_match" : "verification_mismatch",
      expected_value: expected,
      actual_value: data.actualUrl,
      result: matched ? "match" : "mismatch",
      user_id: caller.userId,
      device_info: ((data.deviceInfo ?? {}) as unknown as Json),
    });

    return { ok: true as const, matched, expected };
  });

/** Manufacturing sign-off: the unit is programmed, verified and ready for assembly. */
export const markAssemblyComplete = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();

    const { data: row } = await client
      .from("plaque_programming")
      .select("verification_status")
      .eq("plaque_id", data.plaqueId)
      .maybeSingle();
    if (row?.verification_status !== "verified") return { ok: false as const, error: "not_verified" as const };

    await client.from("plaques").update({ status: "packed" }).eq("id", data.plaqueId);
    return { ok: true as const };
  });

/** Fast manufacturing path: create a blank plaque and hand back its SmartLink. */
export const createPlaqueForProgramming = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        productType: z.string().min(1).max(60),
        style: z.string().min(1).max(60),
        baseType: z.string().min(1).max(60),
        batchId: z.string().max(60).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error, plaque: null, activationUrl: null };
    const client = await db();

    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const slugBytes = crypto.getRandomValues(new Uint8Array(6));
    const publicSlug = [...slugBytes].map((b) => alphabet[b % alphabet.length]).join("");
    const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
    const token = [...tokenBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const plaqueCode = `TL-${Math.floor(100000 + Math.random() * 899999)}`;

    const { data: plaque, error } = await client
      .from("plaques")
      .insert({
        plaque_code: plaqueCode,
        public_slug: publicSlug,
        activation_token_hash: tokenHash,
        product_type: data.productType,
        style: data.style,
        base_type: data.baseType,
        batch_id: data.batchId || null,
        status: "inventory",
      })
      .select(PLAQUE_COLUMNS)
      .maybeSingle();

    if (error || !plaque) return { ok: false as const, error: "create_failed" as const, plaque: null, activationUrl: null };

    await ensureRow(client, plaque.id, plaque.public_slug, plaque.batch_id);
    return { ok: true as const, plaque, activationUrl: `/activate/${token}` };
  });

/** Batches with their programming progress. */
export const listBatches = createServerFn({ method: "POST" }).handler(async () => {
  const caller = await admin();
  if (!caller.ok) return { ok: false as const, error: caller.error, batches: [] };
  const client = await db();

  const { data: plaques } = await client.from("plaques").select("id, batch_id").not("batch_id", "is", null);
  const { data: rows } = await client.from("plaque_programming").select("plaque_id, verification_status");
  const verified = new Set((rows ?? []).filter((r) => r.verification_status === "verified").map((r) => r.plaque_id));

  const map = new Map<string, { batchId: string; total: number; programmed: number }>();
  for (const p of plaques ?? []) {
    const key = p.batch_id as string;
    const entry = map.get(key) ?? { batchId: key, total: 0, programmed: 0 };
    entry.total += 1;
    if (verified.has(p.id)) entry.programmed += 1;
    map.set(key, entry);
  }
  return { ok: true as const, batches: [...map.values()].sort((a, b) => a.batchId.localeCompare(b.batchId)) };
});

/** Ordered programming queue for one batch. */
export const batchQueue = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ batchId: z.string().min(1).max(60) }).parse(data))
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error, items: [] };
    const client = await db();

    const { data: plaques } = await client
      .from("plaques")
      .select(PLAQUE_COLUMNS)
      .eq("batch_id", data.batchId)
      .order("plaque_code", { ascending: true });

    const ids = (plaques ?? []).map((p) => p.id);
    const { data: rows } = await client
      .from("plaque_programming")
      .select("plaque_id, write_status, verification_status")
      .in("plaque_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const byId = new Map((rows ?? []).map((r) => [r.plaque_id, r]));

    return {
      ok: true as const,
      items: (plaques ?? []).map((p) => ({
        plaque: p,
        writeStatus: byId.get(p.id)?.write_status ?? "not_programmed",
        verificationStatus: byId.get(p.id)?.verification_status ?? "not_verified",
      })),
    };
  });

/** Report a physically faulty tag so the unit is pulled from the line. */
export const reportFaultyTag = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ plaqueId: z.string().uuid(), notes: z.string().max(300).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();
    const { data: plaque } = await client
      .from("plaques")
      .select("id, public_slug, batch_id")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const };

    await ensureRow(client, plaque.id, plaque.public_slug, plaque.batch_id);
    await client
      .from("plaque_programming")
      .update({ write_status: "failed", verification_status: "failed", notes: data.notes ?? "Faulty tag reported" })
      .eq("plaque_id", plaque.id);
    await client.from("plaques").update({ status: "faulty" }).eq("id", plaque.id);
    await client.from("programming_events").insert({
      plaque_id: plaque.id,
      event_type: "write_failed",
      result: "faulty_tag",
      user_id: caller.userId,
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ *
 * Cross-platform programming handoff.
 *
 * The web app cannot write NFC on iPhone, so it mints a short-lived,
 * admin-authorised handoff for another device (an Android phone today, the
 * native TapLocal Core NFC app later). The token carries no credentials —
 * it is only a lookup key, and every use is re-authorised server-side.
 * ------------------------------------------------------------------ */

const HANDOFF_TTL_MINUTES = 30;

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 40);
}

/** Creates a short-lived handoff for one plaque. Admin only. */
export const createProgrammingHandoff = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error, token: null, expiresAt: null };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, public_slug")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const, token: null, expiresAt: null };

    const token = newToken();
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_MINUTES * 60_000).toISOString();
    await client.from("nfc_handoffs").insert({
      token,
      plaque_id: plaque.id,
      expected_url: nfcUrl(plaque.public_slug),
      created_by_user_id: caller.userId,
      expires_at: expiresAt,
    });
    return { ok: true as const, token, expiresAt, expiresInMinutes: HANDOFF_TTL_MINUTES };
  });

/** Resolves a handoff on the second device. Requires an admin session there too. */
export const resolveProgrammingHandoff = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: z.string().min(8).max(64) }).parse(data))
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error, plaque: null, expectedUrl: null };
    const client = await db();

    const { data: handoff } = await client
      .from("nfc_handoffs")
      .select("id, plaque_id, expected_url, expires_at, used_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!handoff) return { ok: false as const, error: "not_found" as const, plaque: null, expectedUrl: null };
    if (new Date(handoff.expires_at).getTime() < Date.now())
      return { ok: false as const, error: "expired" as const, plaque: null, expectedUrl: null };

    const { data: plaque } = await client.from("plaques").select(PLAQUE_COLUMNS).eq("id", handoff.plaque_id).maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const, plaque: null, expectedUrl: null };

    return { ok: true as const, plaque, expectedUrl: handoff.expected_url, usedAt: handoff.used_at };
  });

/** The second device (or the future iOS app) reports the outcome back. */
export const completeProgrammingHandoff = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ token: z.string().min(8).max(64), result: z.enum(["written", "verified", "failed"]) }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();
    await client
      .from("nfc_handoffs")
      .update({ used_at: new Date().toISOString(), used_by_user_id: caller.userId, result: data.result })
      .eq("token", data.token);
    return { ok: true as const };
  });
