import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DEMO_TOKEN = "demo-activation-token";

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const lookupActivation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: z.string().min(6).max(200) }).parse(data))
  .handler(async ({ data }) => {
    if (data.token === DEMO_TOKEN) {
      return {
        demo: true as const,
        plaque: { id: "demo", plaque_code: "TL-DEMO01", public_slug: "DEMOQR", status: "inventory" },
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await sha256Hex(data.token);
    const { data: plaque } = await supabaseAdmin
      .from("plaques")
      .select("id, plaque_code, public_slug, status")
      .eq("activation_token_hash", hash)
      .maybeSingle();

    if (!plaque) return { demo: false as const, plaque: null };
    return { demo: false as const, plaque };
  });

const completeSchema = z.object({
  token: z.string().min(6).max(200),
  businessName: z.string().min(1).max(120),
  industry: z.string().min(1).max(60),
  goalType: z.string().min(1).max(60),
  destinationType: z.enum([
    "google_review",
    "instagram",
    "menu",
    "booking",
    "coupon",
    "website",
    "call",
    "directions",
    "custom",
  ]),
  destinationUrl: z.string().url().max(500),
  placementType: z.string().min(1).max(60),
  plaqueName: z.string().min(1).max(80),
});

export const completeActivation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => completeSchema.parse(data))
  .handler(async ({ data }) => {
    if (data.token === DEMO_TOKEN) {
      return { ok: true as const, demo: true as const, publicSlug: "DEMOQR" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await sha256Hex(data.token);
    const { data: plaque } = await supabaseAdmin
      .from("plaques")
      .select("id, business_id, public_slug, status")
      .eq("activation_token_hash", hash)
      .maybeSingle();

    if (!plaque || !plaque.business_id) return { ok: false as const, demo: false as const, error: "not_found" };
    if (plaque.status === "active") return { ok: false as const, demo: false as const, error: "already_active" };
    const businessId = plaque.business_id;

    const now = new Date().toISOString();

    await supabaseAdmin
      .from("businesses")
      .update({ name: data.businessName, industry: data.industry })
      .eq("id", plaque.business_id);

    await supabaseAdmin.from("goals").insert({
      business_id: plaque.business_id,
      goal_type: data.goalType,
      active: true,
    });

    await supabaseAdmin.from("destinations").insert({
      business_id: plaque.business_id,
      plaque_id: plaque.id,
      destination_type: data.destinationType,
      url: data.destinationUrl,
      effective_from: now,
      active: true,
    });

    await supabaseAdmin
      .from("plaques")
      .update({
        plaque_name: data.plaqueName,
        placement_type: data.placementType,
        status: "active",
        activated_at: now,
        activation_token_hash: null,
      })
      .eq("id", plaque.id);

    await supabaseAdmin.from("action_history").insert({
      business_id: plaque.business_id,
      plaque_id: plaque.id,
      action_type: "plaque_activated",
      initiated_by: "owner",
      new_value: { placement_type: data.placementType, destination_type: data.destinationType },
    });

    return { ok: true as const, demo: false as const, publicSlug: plaque.public_slug };
  });
