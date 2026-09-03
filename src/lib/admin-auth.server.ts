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

  const userId = (await caller.auth.getUser()).data.user?.id;
  if (!userId) return { ok: false, error: "unauthorized" };

  const { data: isAdmin } = await caller.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) return { ok: false, error: "forbidden" };

  return { ok: true, userId };
}
