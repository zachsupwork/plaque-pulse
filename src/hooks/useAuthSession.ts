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

/** Shared sign-out with loading + error state, used by admin and the business portal. */
export function useSignOut(redirectTo: "/admin" | "/" = "/admin") {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (pending) return;
    setPending(true);
    setError(null);
    const { ok } = await signOutAndReset(queryClient);
    if (!ok) {
      setError("Couldn't sign you out. Try again.");
      setPending(false);
      return;
    }
    await navigate({ to: redirectTo, replace: true });
    await queryClient.invalidateQueries({ queryKey: ["admin-identity"] });
    setPending(false);
  }

  return { signOut, pending, error };
}
