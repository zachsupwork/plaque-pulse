import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const buttonSchema = z.object({
  id: z.string().min(1).max(20),
  kind: z.enum(["google_review", "instagram", "menu", "website", "booking", "directions", "call", "facebook", "tiktok", "offer", "custom"]),
  label: z.string().min(1).max(60),
  url: z.string().min(3).max(1000).refine((u) => /^(https?:|tel:|mailto:)/i.test(u), "Must be a web, tel: or mailto: link"),
  enabled: z.boolean(),
});

/** Public: load a TapLocal Page and record the landing-page view. */
export const getPublicPage = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({
      key: z.string().min(2).max(64),
      t: z.string().uuid().optional(),
      src: z.enum(["nfc", "qr"]).optional(),
      rv: z.string().uuid().optional(),
      test: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { resolvePageKey, anonVisitor, coarseDevice } = await import("./business-page.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const found = await resolvePageKey(data.key);
    if (!found) return null;
    const { page, plaque } = found;
    const request = getRequest();
    const { data: biz } = await supabaseAdmin.from("businesses").select("name").eq("id", page.business_id).maybeSingle();

    const { data: view } = await supabaseAdmin.from("events").insert({
      event_type: data.test ? "manufacturing_test" : "page_view",
      business_id: page.business_id,
      plaque_id: plaque?.id ?? null,
      location_id: plaque?.location_id ?? null,
      source_type: data.src ?? null,
      device_family: coarseDevice(request),
      anonymous_visitor_key: data.test ? null : anonVisitor(request),
      metadata: {
        tap_event_id: data.t ?? null,
        referral_event_id: data.rv ?? null,
        confirmed_referral: Boolean(data.rv),
        ...(data.test ? { tl_test: true, page_view: true } : {}),
      },
    }).select("id").single();

    const buttons = (page.buttons as Array<z.infer<typeof buttonSchema>>).filter((b) => b.enabled);
    return {
      key: data.key,
      viewId: (view?.id as string | undefined) ?? null,
      name: page.title || biz?.name || "This business",
      description: page.description,
      logoUrl: page.logo_url,
      accent: page.accent,
      shareCode: page.share_code,
      buttons: buttons.map((b) => ({ id: b.id, kind: b.kind, label: b.label })),
    };
  });

async function ownerGate(businessId: string) {
  const { requireBusinessAccess } = await import("./business-auth.server");
  const access = await requireBusinessAccess(businessId);
  if (!access.ok) throw new Error(access.error);
  return access;
}

export const getMyPage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ businessId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await ownerGate(data.businessId);
    const { getOrCreatePage } = await import("./business-page.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const page = await getOrCreatePage(data.businessId);
    const { data: plaques } = await supabaseAdmin
      .from("plaques").select("id, plaque_code, plaque_name, public_slug, destination_mode").eq("business_id", data.businessId);
    return { page: { ...page, buttons: page.buttons as Array<z.infer<typeof buttonSchema>> }, plaques: plaques ?? [] };
  });

export const suggestPageButtons = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ businessId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await ownerGate(data.businessId);
    const { suggestedButtons } = await import("./business-page.server");
    return suggestedButtons(data.businessId);
  });

export const saveMyPage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      businessId: z.string().uuid(),
      title: z.string().max(80).nullable(),
      description: z.string().max(280).nullable(),
      logoUrl: z.string().url().max(1000).nullable(),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      buttons: z.array(buttonSchema).max(20),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const access = await ownerGate(data.businessId);
    if (access.demo) throw new Error("demo_read_only");
    const { getOrCreatePage } = await import("./business-page.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await getOrCreatePage(data.businessId);
    const { error } = await supabaseAdmin.from("business_pages").update({
      title: data.title, description: data.description, logo_url: data.logoUrl, accent: data.accent, buttons: data.buttons,
    }).eq("business_id", data.businessId);
    if (error) throw error;
    return { ok: true };
  });

/** Switch a plaque between Direct and TapLocal Page. The tag itself is never touched. */
export const setPlaqueMode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ businessId: z.string().uuid(), plaqueId: z.string().uuid(), mode: z.enum(["direct", "page"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const access = await ownerGate(data.businessId);
    if (access.demo) throw new Error("demo_read_only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plaque } = await supabaseAdmin.from("plaques").select("destination_mode").eq("id", data.plaqueId).eq("business_id", data.businessId).maybeSingle();
    if (!plaque) throw new Error("not_found");
    if (data.mode === "page") {
      const { getOrCreatePage } = await import("./business-page.server");
      await getOrCreatePage(data.businessId);
    }
    await supabaseAdmin.from("plaques").update({ destination_mode: data.mode }).eq("id", data.plaqueId);
    await supabaseAdmin.from("action_history").insert({
      business_id: data.businessId, plaque_id: data.plaqueId, action_type: "destination_mode_change",
      initiated_by: "owner", approved_by_user_id: access.userId,
      previous_value: { mode: plaque.destination_mode }, new_value: { mode: data.mode },
    });
    return { ok: true };
  });
