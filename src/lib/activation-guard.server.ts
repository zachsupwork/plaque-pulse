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
 * Short activation codes are guessable, so every lookup is counted per caller.
 * Returns false once the caller has burned through the window's budget.
 */
export async function allowActivationAttempt(): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const attemptKey = callerKey();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count } = await supabaseAdmin
    .from("activation_attempts")
    .select("id", { count: "exact", head: true })
    .eq("attempt_key", attemptKey)
    .gte("created_at", since);

  if ((count ?? 0) >= MAX_ATTEMPTS) return false;
  await supabaseAdmin.from("activation_attempts").insert({ attempt_key: attemptKey });
  return true;
}

export async function markAttemptSucceeded() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("activation_attempts").insert({ attempt_key: callerKey(), succeeded: true });
}
