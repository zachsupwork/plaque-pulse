import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSlug() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const schema = z.object({
  quantity: z.number().int().min(1).max(20),
  productType: z.string().min(1).max(60),
  style: z.string().min(1).max(60),
  baseType: z.string().min(1).max(60),
});

/**
 * Provision blank plaques. Admin-only: verified through the caller's own session,
 * never through the privileged client.
 */
export const provisionPlaques = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { createClient } = await import("@supabase/supabase-js");

    const authHeader = getRequest().headers.get("authorization") ?? "";
    if (!authHeader) return { ok: false as const, error: "unauthorized", plaques: [] };

    const caller = createClient(
      process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authHeader } } },
    );

    const { data: isAdmin } = await caller.rpc("has_role", {
      _user_id: (await caller.auth.getUser()).data.user?.id ?? "",
      _role: "admin",
    });
    if (!isAdmin) return { ok: false as const, error: "forbidden", plaques: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const created: Array<{ plaqueCode: string; publicSlug: string; activationUrl: string }> = [];
    for (let i = 0; i < data.quantity; i += 1) {
      const token = randomToken();
      const publicSlug = randomSlug();
      const plaqueCode = `TL-${Math.floor(100000 + Math.random() * 899999)}`;
      const { error } = await supabaseAdmin.from("plaques").insert({
        plaque_code: plaqueCode,
        public_slug: publicSlug,
        activation_token_hash: await sha256Hex(token),
        product_type: data.productType,
        style: data.style,
        base_type: data.baseType,
        status: "inventory",
      });
      if (error) continue;
      created.push({ plaqueCode, publicSlug, activationUrl: `/activate/${token}` });
    }

    return { ok: true as const, plaques: created };
  });
