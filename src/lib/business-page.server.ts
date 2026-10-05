import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PageButtonKind =
  | "google_review" | "instagram" | "menu" | "website" | "booking" | "directions"
  | "call" | "facebook" | "tiktok" | "offer" | "custom";

export type PageButton = { id: string; kind: PageButtonKind; label: string; url: string; enabled: boolean };

export const BUTTON_LABEL: Record<PageButtonKind, string> = {
  google_review: "Leave a Google review",
  instagram: "Follow on Instagram",
  menu: "See the menu",
  website: "Order / Website",
  booking: "Book now",
  directions: "Get directions",
  call: "Call us",
  facebook: "Facebook",
  tiktok: "TikTok",
  offer: "Today's offer",
  custom: "Link",
};

/** Event destination_type enum value for a button kind. */
export function buttonDestinationType(kind: PageButtonKind) {
  const map: Record<PageButtonKind, string> = {
    google_review: "google_review", instagram: "instagram", menu: "menu", website: "website",
    booking: "booking", directions: "directions", call: "call", facebook: "facebook",
    tiktok: "custom", offer: "coupon", custom: "custom",
  };
  return map[kind] as "custom";
}

/** Build starting buttons from links TapLocal already knows (destinations + discovered place data). */
export async function suggestedButtons(businessId: string): Promise<PageButton[]> {
  const [{ data: dests }, { data: locs }, { data: socials }] = await Promise.all([
    supabaseAdmin.from("destinations").select("destination_type, url, metadata").eq("business_id", businessId).eq("active", true).is("effective_to", null),
    supabaseAdmin.from("locations").select("google_review_url, google_maps_uri, website_url, phone").eq("business_id", businessId).limit(1),
    supabaseAdmin.from("business_social_profiles").select("platform, profile_url").eq("business_id", businessId),
  ]);
  const out: PageButton[] = [];
  const add = (kind: PageButtonKind, url: string | null | undefined) => {
    if (!url || out.some((b) => b.kind === kind)) return;
    out.push({ id: crypto.randomUUID().slice(0, 8), kind, label: BUTTON_LABEL[kind], url, enabled: true });
  };
  const loc = locs?.[0];
  add("google_review", loc?.google_review_url);
  for (const d of dests ?? []) {
    const kind = (["google_review", "instagram", "menu", "website", "booking", "facebook", "directions", "call"] as const).find((k) => k === d.destination_type);
    if (kind) add(kind, d.url);
  }
  for (const s of socials ?? []) {
    if (s.platform === "instagram") add("instagram", s.profile_url);
    if (s.platform === "facebook") add("facebook", s.profile_url);
    if (s.platform === "tiktok") add("tiktok", s.profile_url);
  }
  add("website", loc?.website_url);
  add("directions", loc?.google_maps_uri);
  add("call", loc?.phone ? `tel:${loc.phone.replace(/[^\d+]/g, "")}` : null);
  return out;
}

export async function getOrCreatePage(businessId: string) {
  const { data } = await supabaseAdmin.from("business_pages").select("*").eq("business_id", businessId).maybeSingle();
  if (data) return data;
  const buttons = await suggestedButtons(businessId);
  const { data: biz } = await supabaseAdmin.from("businesses").select("name").eq("id", businessId).maybeSingle();
  const { data: created, error } = await supabaseAdmin
    .from("business_pages")
    .insert({ business_id: businessId, title: biz?.name ?? null, buttons })
    .select("*")
    .single();
  if (error) throw error;
  return created;
}

export function coarseDevice(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh|Windows|X11|Linux/i.test(ua)) return "Desktop";
  return "Other";
}

export function anonVisitor(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "";
  let hash = 0;
  for (const char of `${ua}|${ip}`) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `v_${Math.abs(hash).toString(36)}`;
}

/** Resolve /p/{key}: a plaque slug, or a business share code. */
export async function resolvePageKey(key: string) {
  const { data: plaque } = await supabaseAdmin
    .from("plaques").select("id, business_id, location_id, public_slug").eq("public_slug", key).maybeSingle();
  if (plaque?.business_id) {
    const page = await getOrCreatePage(plaque.business_id);
    return { page, plaque };
  }
  const { data: page } = await supabaseAdmin.from("business_pages").select("*").eq("share_code", key).maybeSingle();
  return page ? { page, plaque: null } : null;
}
