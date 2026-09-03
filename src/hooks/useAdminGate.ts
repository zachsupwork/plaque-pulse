import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkAdmin } from "@/lib/nfc.functions";

/** Client-side convenience gate. The server functions enforce the real rule. */
export function useAdminGate() {
  const check = useServerFn(checkAdmin);
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: () => check({ data: undefined }),
    staleTime: 60_000,
  });
}
