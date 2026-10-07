import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Server-side activation progress, keyed to the plaque the private token unlocks.
 * Lets a sign-in email opened in another tab or device resume the same setup.
 * Never marks the plaque configured or claimed.
 */
async function unclaimedPlaqueId(token: string) {
  const { activationHashes } = await import("./activation-guard.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hashes = await activationHashes(token);
  const { data } = await supabaseAdmin
    .from("plaques")
    .select("id, claimed_at")
    .in("activation_token_hash", hashes)
    .maybeSingle();
  if (!data || data.claimed_at) return null;
  return { id: data.id, supabaseAdmin };
}

export const loadActivationDraft = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(6).max(200) }).parse(d))
  .handler(async ({ data }) => {
    if (data.token === "demo-activation-token") return { draft: null };
    const found = await unclaimedPlaqueId(data.token);
    if (!found) return { draft: null };
    const { data: row } = await found.supabaseAdmin
      .from("activation_drafts")
      .select("draft")
      .eq("plaque_id", found.id)
      .maybeSingle();
    return { draft: row?.draft ? JSON.stringify(row.draft) : null };
  });

export const saveActivationDraft = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(6).max(200),
        // Only the setup state needed to resume; bounded in size.
        draft: z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length < 20000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.token === "demo-activation-token") return { ok: true };
    const found = await unclaimedPlaqueId(data.token);
    if (found) {
      await found.supabaseAdmin
        .from("activation_drafts")
        .upsert({ plaque_id: found.id, draft: data.draft as never }, { onConflict: "plaque_id" });
    }
    return { ok: true };
  });
