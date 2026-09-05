import { getRequest } from "@tanstack/react-start/server";

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function callerKey() {
  const headers = getRequest().headers;
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 12;

/**
 * Short activation codes are guessable and Google lookups cost money, so every
 * public call is counted per caller. Returns false once the budget is spent.
 */
export async function allowRequest(prefix: string, max: number, windowMs = WINDOW_MS): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const attemptKey = `${prefix}:${callerKey()}`;
  const since = new Date(Date.now() - windowMs).toISOString();

  const { count } = await supabaseAdmin
    .from("activation_attempts")
    .select("id", { count: "exact", head: true })
    .eq("attempt_key", attemptKey)
    .gte("created_at", since);

  if ((count ?? 0) >= max) return false;
  await supabaseAdmin.from("activation_attempts").insert({ attempt_key: attemptKey });
  return true;
}

export function allowActivationAttempt() {
  return allowRequest("activate", MAX_ATTEMPTS);
}

