import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { exitDemo } from "@/lib/demo";

/**
 * A real sign-out: end the Supabase session, then wipe every cached trace of
 * the previous person — query cache, demo preview flag and any stored business
 * selection — so nothing from the last account stays on screen.
 */
export async function signOutEverything(queryClient: QueryClient) {
  try {
    await supabase.auth.signOut();
  } catch {
    /* already signed out */
  }
  exitDemo();
  try {
    window.sessionStorage.removeItem("tl_active_business");
    window.localStorage.removeItem("tl_active_business");
  } catch {
    /* storage blocked */
  }
  await queryClient.cancelQueries();
  queryClient.clear();
}
