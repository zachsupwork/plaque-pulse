/**
 * Server-only bootstrap for the two TapLocal platform-owner accounts.
 *
 * The allowlist lives in the server environment (TAPLOCAL_ADMIN_EMAILS) and is
 * never shipped to the browser. Only an email taken from a Supabase-verified
 * session may be compared against it — callers must never pass browser input.
 */

function allowlist(): string[] {
  return (process.env["TAPLOCAL_ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isBootstrapAdminEmail(verifiedEmail: string | null | undefined): boolean {
  if (!verifiedEmail) return false;
  return allowlist().includes(verifiedEmail.trim().toLowerCase());
}

/**
 * Idempotently grants the admin role to an allowlisted, already-authenticated
 * account. Returns true when the caller holds (or now holds) the admin role.
 */
export async function ensureBootstrapAdmin(
  verifiedUserId: string,
  verifiedEmail: string | null | undefined,
): Promise<boolean> {
  if (!isBootstrapAdminEmail(verifiedEmail)) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: verifiedUserId, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });

  if (error) {
    console.error("[admin-bootstrap] failed to grant admin role", error.message);
    return false;
  }
  return true;
}
