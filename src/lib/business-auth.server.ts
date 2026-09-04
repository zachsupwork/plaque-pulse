import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";

export const DEMO_BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

export type BusinessCaller =
  | { ok: true; userId: string | null; demo: boolean }
  | { ok: false; error: "unauthorized" | "forbidden" };

/**
 * Verifies the caller may manage NFC tags for this business.
 * The public demo business stays open so the guided tour works without an account;
 * every real business requires an authenticated member.
 */
export async function requireBusinessAccess(businessId: string): Promise<BusinessCaller> {
  const authHeader = getRequest().headers.get("authorization") ?? "";

  if (!authHeader) {
    return businessId === DEMO_BUSINESS_ID ? { ok: true, userId: null, demo: true } : { ok: false, error: "unauthorized" };
  }

  const caller = createClient(
    process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    },
  );

  const userId = (await caller.auth.getUser()).data.user?.id ?? null;
  if (!userId) {
    return businessId === DEMO_BUSINESS_ID ? { ok: true, userId: null, demo: true } : { ok: false, error: "unauthorized" };
  }

  const { data: membership } = await caller
    .from("business_members")
    .select("business_id")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membership) return { ok: true, userId, demo: false };
  if (businessId === DEMO_BUSINESS_ID) return { ok: true, userId, demo: true };
  return { ok: false, error: "forbidden" };
}
