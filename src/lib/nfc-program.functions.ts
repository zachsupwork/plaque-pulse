import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nfcUrl } from "@/lib/smartlink";
import { nfcProgramSchemeLink, nfcProgramUniversalLink, nfcReturnUrl } from "@/lib/nfc-transport";

/**
 * Secure NFC programming sessions.
 *
 * A session is a short-lived, single-use permission to write ONE plaque's
 * permanent TapLocal SmartLink. The expected URL is decided by the server and
 * stored with the session — a browser, a native app or a user can never
 * substitute a Google, Instagram or arbitrary destination.
 */

const TTL_MINUTES = 8;

async function admin() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** High-entropy, URL-safe, single-purpose token. Only its hash is stored. */
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Only same-origin app paths may be remembered as a return destination. */
function safeReturnPath(raw: string | undefined) {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw.slice(0, 300);
}

/**
 * Admin/authorized operation: mint a programming session for a plaque.
 * Returns the launch links for the native writer — never any credential.
 */
export const createNfcProgrammingSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        plaqueId: z.string().uuid(),
        platform: z.enum(["ios", "android", "other"]).default("ios"),
        returnPath: z.string().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error, session: null };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, plaque_code, public_slug, status")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const, session: null };
    if (["retired", "replaced"].includes(plaque.status))
      return { ok: false as const, error: "not_eligible" as const, session: null };

    const token = newToken();
    const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000).toISOString();
    const expectedUrl = nfcUrl(plaque.public_slug);

    const { data: session } = await client
      .from("nfc_programming_sessions")
      .insert({
        token_hash: await hashToken(token),
        plaque_id: plaque.id,
        requested_by_user_id: caller.userId,
        expected_url: expectedUrl,
        platform: data.platform,
        return_path: safeReturnPath(data.returnPath),
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (!session) return { ok: false as const, error: "failed" as const, session: null };

    return {
      ok: true as const,
      error: null,
      session: {
        id: session.id,
        plaqueCode: plaque.plaque_code,
        expectedUrl,
        expiresAt,
        expiresInMinutes: TTL_MINUTES,
        universalLink: nfcProgramUniversalLink(token),
        schemeLink: nfcProgramSchemeLink(token),
        returnUrl: nfcReturnUrl(session.id),
      },
    };
  });

/**
 * Server-held state of a session. Used by the return page and by the browser
 * polling while the native writer is open, so no setup state lives in the URL.
 */
export const getNfcProgrammingSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ sessionId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error, session: null };
    const client = await db();

    const { data: session } = await client
      .from("nfc_programming_sessions")
      .select("id, plaque_id, expected_url, status, error_code, return_path, expires_at, verified_at")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) return { ok: false as const, error: "not_found" as const, session: null };

    const { data: plaque } = await client
      .from("plaques")
      .select("id, plaque_code, public_slug, business_id, placement_type, plaque_name, status")
      .eq("id", session.plaque_id)
      .maybeSingle();

    const expired = new Date(session.expires_at).getTime() < Date.now();
    const status = expired && !["verified", "written", "failed"].includes(session.status) ? "expired" : session.status;

    return {
      ok: true as const,
      error: null,
      session: {
        id: session.id,
        status,
        errorCode: session.error_code,
        expectedUrl: session.expected_url,
        returnPath: session.return_path,
        verifiedAt: session.verified_at,
        plaque,
      },
    };
  });

/**
 * Manual fallback: the operator wrote the tag with an outside NFC app.
 * Recorded as programmed, never as verified.
 */
export const reportManualProgramming = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await admin();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, public_slug")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const };

    const expected = nfcUrl(plaque.public_slug);
    await client
      .from("plaque_programming")
      .upsert(
        {
          plaque_id: plaque.id,
          expected_nfc_url: expected,
          write_status: "written",
          verification_status: "unverified",
          programmed_at: new Date().toISOString(),
          programmed_by_user_id: caller.userId,
          device_info: { method: "external_manual" },
        },
        { onConflict: "plaque_id" },
      );

    await client.from("programming_events").insert({
      plaque_id: plaque.id,
      event_type: "write",
      expected_value: expected,
      result: "manual_unverified",
      user_id: caller.userId,
      device_info: { programming_method: "external_manual" },
    });

    return { ok: true as const, error: null };
  });
