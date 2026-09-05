import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { exitDemo } from "@/lib/demo";

const LOCAL_UI_KEYS = ["tl_active_business", "tl_admin_preview_business", "tl_customer_preview", "tl_setup_draft"];

/**
 * The one sign-out used everywhere: end the Supabase session, confirm it is
 * really gone, then wipe every cached trace of the previous person — query
 * cache, demo preview flag and any stored business selection.
 */
export async function signOutAndReset(queryClient: QueryClient): Promise<{ ok: boolean }> {
  const { error } = await supabase.auth.signOut({ scope: "local" });

  // Verify the local session is actually gone before claiming success.
  const { data } = await supabase.auth.getSession();
  if (error && data.session) return { ok: false };

  exitDemo();
  try {
    for (const key of LOCAL_UI_KEYS) {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    }
  } catch {
    /* storage blocked */
  }

  await queryClient.cancelQueries();
  queryClient.clear();
  return { ok: !data.session };
}

/** Backwards-compatible name used by older call sites. */
export async function signOutEverything(queryClient: QueryClient) {
  await signOutAndReset(queryClient);
}
