import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

const input = z.object({ plaqueId: z.string().uuid() });

type Plaque = {
  id: string;
  plaque_code: string;
  public_slug: string;
  business_id: string | null;
  claimed_at: string | null;
  activation_token_hash: string | null;
  activation_code_encrypted: string | null;
};

async function loadPlaque(plaqueId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("plaques")
    .select("id, plaque_code, public_slug, business_id, claimed_at, activation_token_hash, activation_code_encrypted")
    .eq("id", plaqueId)
    .maybeSingle();
  return { client: supabaseAdmin, plaque: data as Plaque | null };
}

async function log(client: any, plaque: Plaque, userId: string, action: string) {
  if (!plaque.business_id) return; // action_history requires a business
  await client.from("action_history").insert({
    business_id: plaque.business_id,
    plaque_id: plaque.id,
    action_type: action,
    initiated_by: "admin",
    approved_by_user_id: userId,
    new_value: { plaque_code: plaque.plaque_code, slug: plaque.public_slug },
  });
}

/** Whether a code exists and whether it can be revealed. Never returns the code. */
export const activationCodeStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const { plaque } = await loadPlaque(data.plaqueId);
    if (!plaque) return { ok: false as const, error: "not_found" as const };
    return {
      ok: true as const,
      claimed: Boolean(plaque.claimed_at),
      hasCode: Boolean(plaque.activation_token_hash),
      recoverable: Boolean(plaque.activation_code_encrypted) && !plaque.claimed_at,
    };
  });

export const revealActivationCode = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const { client, plaque } = await loadPlaque(data.plaqueId);
    if (!plaque) return { ok: false as const, error: "not_found" as const };
    if (plaque.claimed_at) return { ok: false as const, error: "claimed" as const };
    if (!plaque.activation_code_encrypted) return { ok: false as const, error: "not_recoverable" as const };
    const { decryptActivationCode } = await import("@/lib/activation-crypto.server");
    const code = await decryptActivationCode(plaque.activation_code_encrypted);
    if (!code) return { ok: false as const, error: "not_recoverable" as const };
    await log(client, plaque, caller.userId, "activation_code_revealed");
    return { ok: true as const, code, plaqueCode: plaque.plaque_code, slug: plaque.public_slug };
  });

/** Replaces the hash (and encrypted copy) only. Slug, links and programming stay untouched. */
export const regenerateActivationCode = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const { client, plaque } = await loadPlaque(data.plaqueId);
    if (!plaque) return { ok: false as const, error: "not_found" as const };
    if (plaque.claimed_at) return { ok: false as const, error: "claimed" as const };
    const { activationCode } = await import("@/lib/area-builder.server");
    const { sha256Hex } = await import("@/lib/activation-guard.server");
    const { encryptActivationCode } = await import("@/lib/activation-crypto.server");
    const code = activationCode();
    const { error } = await client
      .from("plaques")
      .update({
        activation_token_hash: await sha256Hex(code),
        activation_code_encrypted: await encryptActivationCode(code),
      })
      .eq("id", plaque.id)
      .is("claimed_at", null);
    if (error) return { ok: false as const, error: "update_failed" as const };
    await log(client, plaque, caller.userId, "activation_code_regenerated");
    return { ok: true as const, code, plaqueCode: plaque.plaque_code, slug: plaque.public_slug };
  });
