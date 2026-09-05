import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";

export type AdminCaller = { ok: true; userId: string } | { ok: false; error: "unauthorized" | "forbidden" };

/**
 * Verifies the caller is a TapLocal admin using their own session token —
 * never the privileged client.
 */
export async function requireAdmin(): Promise<AdminCaller> {
  const authHeader = getRequest().headers.get("authorization") ?? "";
  if (!authHeader) return { ok: false, error: "unauthorized" };

  const caller = createClient(
    process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    },
  );

  const callerUser = (await caller.auth.getUser()).data.user;
  const userId = callerUser?.id;
  if (!userId) return { ok: false, error: "unauthorized" };

  // Server-side allowlist bootstrap for the TapLocal platform-owner accounts.
  const { ensureBootstrapAdmin } = await import("@/lib/admin-bootstrap.server");
  await ensureBootstrapAdmin(userId, callerUser?.email);

  // Role check runs as the caller: RLS on user_roles only exposes their own rows,
  // and the roles table itself accepts no client-side writes.
  const { data: roleRow } = await caller
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return { ok: false, error: "forbidden" };

  return { ok: true, userId };
}
