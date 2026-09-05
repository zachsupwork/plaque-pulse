import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { adminIdentity } from "@/lib/admin-data.functions";
import { signOutAndReset } from "@/lib/admin-session";

/** Verified session identity: who is signed in and whether they are platform staff. */
export function useIdentity() {
  const check = useServerFn(adminIdentity);
  return useQuery({
    queryKey: ["admin-identity"],
    queryFn: () => check({ data: undefined }),
    staleTime: 60_000,
  });
}

/**
 * The one sign-out used everywhere. Ends the session, wipes cached data and
 * then does a real page load of the public homepage, so no authenticated
 * screen can survive in memory or in the back/forward cache.
 */
export function useSignOut(_redirectTo?: string) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (pending) return;
    setPending(true);
    setError(null);
    const { ok } = await signOutAndReset(queryClient);
    if (!ok) {
      setError("We couldn't sign you out. Try again.");
      setPending(false);
      return;
    }
    window.location.replace("/");
  }

  return { signOut, pending, error };
}

