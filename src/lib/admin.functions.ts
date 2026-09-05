import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nfcUrl, qrUrl } from "@/lib/smartlink";

/** Unambiguous alphabet: no 0, O, 1, I or L, so a printed code can be typed back. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Human-friendly activation code, e.g. 8FQ2-KD91 (~40 bits of entropy). */
function activationCode() {
  const bytes = crypto.getRandomValues(new Uint32Array(8));
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function randomSlug() {
  const bytes = crypto.getRandomValues(new Uint32Array(6));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Every sensitive admin change is written to the business's action history. */
async function logAdminAction(
  client: Awaited<ReturnType<typeof db>>,
  input: {
    businessId: string;
    plaqueId?: string | null;
    actionType: string;
    previous?: unknown;
    next?: unknown;
    userId: string;
  },
) {
  await client.from("action_history").insert({
    business_id: input.businessId,
    plaque_id: input.plaqueId ?? null,
    action_type: input.actionType,
    previous_value: (input.previous ?? null) as never,
    new_value: (input.next ?? null) as never,
    initiated_by: "admin",
    approved_by_user_id: input.userId,
  });
}

export const PRODUCT_TYPES = ["google_review_plaque", "instagram_plaque", "universal_plaque", "custom"] as const;
export const STYLES = ["cloud_white", "soft_pink", "light_smoke", "black_marble", "custom"] as const;
export const BASE_TYPES = ["clear_acrylic", "weighted_metal", "black_frame", "other"] as const;

const provisionSchema = z.object({
  quantity: z.number().int().min(1).max(50),
  productType: z.string().min(1).max(60),
  style: z.string().min(1).max(60),
  baseType: z.string().min(1).max(60),
  batchId: z.string().max(40).nullish(),
});

/**
 * Create blank plaques. Admin-only, verified through the caller's own session.
 * The plaintext activation code is returned once and never stored.
 */
export const provisionPlaques = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => provisionSchema.parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, plaques: [] };
    const client = await db();

    const created: Array<{
      id: string;
      plaqueCode: string;
      publicSlug: string;
      nfcUrl: string;
      qrUrl: string;
      activationCode: string;
      activationUrl: string;
    }> = [];

    for (let i = 0; i < data.quantity; i += 1) {
      const code = activationCode();
      const publicSlug = randomSlug();
      const plaqueCode = `TL-${Math.floor(100000 + Math.random() * 899999)}`;
      const { data: row, error } = await client
        .from("plaques")
        .insert({
          plaque_code: plaqueCode,
          public_slug: publicSlug,
          activation_token_hash: await sha256Hex(code),
          product_type: data.productType,
          style: data.style,
          base_type: data.baseType,
          batch_id: data.batchId || null,
          status: "inventory",
        })
        .select("id")
        .maybeSingle();
      if (error || !row) continue;

      await client.from("plaque_programming").insert({
        plaque_id: row.id,
        batch_id: data.batchId || null,
        expected_nfc_url: nfcUrl(publicSlug),
      });

      created.push({
        id: row.id,
        plaqueCode,
        publicSlug,
        nfcUrl: nfcUrl(publicSlug),
        qrUrl: qrUrl(publicSlug),
        activationCode: code,
        activationUrl: `${nfcUrl(publicSlug).replace(/\/n\/.*$/, "")}/activate/${code}`,
      });
    }

    return { ok: true as const, plaques: created };
  });

/** Move a plaque through manufacturing states (e.g. mark it packed). */
export const setPlaqueStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        plaqueId: z.string().uuid(),
        status: z.enum(["inventory", "packed", "sold", "active", "paused", "faulty", "replaced", "retired"]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, status, business_id")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" };

    await client.from("plaques").update({ status: data.status }).eq("id", data.plaqueId);
    if (plaque.business_id)
      await logAdminAction(client, {
        businessId: plaque.business_id,
        plaqueId: plaque.id,
        actionType: "plaque_status_changed",
        previous: { status: plaque.status },
        next: { status: data.status },
        userId: caller.userId,
      });

    return { ok: true as const };
  });

/** Assign a plaque to a customer business (and optionally a location/placement). */
export const assignPlaque = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        plaqueId: z.string().uuid(),
        businessId: z.string().uuid(),
        locationId: z.string().uuid().nullish(),
        placementType: z.string().max(40).nullish(),
        plaqueName: z.string().max(80).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, business_id, location_id, placement_type, plaque_name")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" };

    await client
      .from("plaques")
      .update({
        business_id: data.businessId,
        location_id: data.locationId ?? plaque.location_id,
        placement_type: data.placementType ?? plaque.placement_type,
        plaque_name: data.plaqueName ?? plaque.plaque_name,
        configured_at: new Date().toISOString(),
      })
      .eq("id", data.plaqueId);

    await logAdminAction(client, {
      businessId: data.businessId,
      plaqueId: plaque.id,
      actionType: "plaque_assigned",
      previous: { business_id: plaque.business_id, placement_type: plaque.placement_type },
      next: { business_id: data.businessId, placement_type: data.placementType ?? plaque.placement_type },
      userId: caller.userId,
    });

    return { ok: true as const };
  });

/** Change where a plaque sends customers. Closes the old row, opens a new one. */
export const setPlaqueDestination = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        plaqueId: z.string().uuid(),
        destinationType: z.string().min(1).max(40),
        url: z.string().url().max(600),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, business_id")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque?.business_id) return { ok: false as const, error: "not_assigned" };

    const now = new Date().toISOString();
    const { data: current } = await client
      .from("destinations")
      .select("id, destination_type, url")
      .eq("plaque_id", data.plaqueId)
      .is("effective_to", null)
      .maybeSingle();

    if (current) await client.from("destinations").update({ effective_to: now, active: false }).eq("id", current.id);

    await client.from("destinations").insert({
      business_id: plaque.business_id,
      plaque_id: plaque.id,
      destination_type: data.destinationType as never,
      url: data.url,
      active: true,
      effective_from: now,
    });

    await logAdminAction(client, {
      businessId: plaque.business_id,
      plaqueId: plaque.id,
      actionType: "destination_changed",
      previous: current ? { type: current.destination_type, url: current.url } : null,
      next: { type: data.destinationType, url: data.url },
      userId: caller.userId,
    });

    return { ok: true as const };
  });
