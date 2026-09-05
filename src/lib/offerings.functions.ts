import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * The public TapLocal catalog and the interest form behind every offering.
 * Reads use the publishable key (only rows marked active are visible), and the
 * inquiry insert is deliberately public — a visitor must be able to raise their
 * hand without an account.
 */

export type Offering = {
  id: string;
  name: string;
  slug: string;
  category: string;
  short_description: string;
  full_description: string | null;
  image_url: string | null;
  icon: string | null;
  featured: boolean;
  sort_order: number;
  cta_label: string;
  starting_price_text: string | null;
  metadata: OfferingMeta;
};

export type OfferingMeta = {
  styles?: string[];
  bases?: string[];
  physical?: boolean;
  quantity?: number;
};

const COLUMNS =
  "id, name, slug, category, short_description, full_description, image_url, icon, featured, sort_order, cta_label, starting_price_text, metadata";

async function publicClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Everything TapLocal currently offers, in display order. */
export const listOfferings = createServerFn({ method: "GET" }).handler(async () => {
  const client = await publicClient();
  const { data } = await client
    .from("offerings")
    .select(COLUMNS)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  return { offerings: (data ?? []) as unknown as Offering[] };
});

/** One offering by its web address. */
export const getOffering = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }) => {
    const client = await publicClient();
    const { data: row } = await client
      .from("offerings")
      .select(COLUMNS)
      .eq("slug", data.slug)
      .eq("active", true)
      .maybeSingle();
    return { offering: (row ?? null) as unknown as Offering | null };
  });

const inquirySchema = z.object({
  offeringId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  preferredContactMethod: z.enum(["email", "phone", "text"]).default("email"),
  businessName: z.string().trim().max(200).optional().or(z.literal("")),
  businessAddress: z.string().trim().max(400).optional().or(z.literal("")),
  googlePlaceId: z.string().trim().max(300).optional().or(z.literal("")),
  quantityInterest: z.string().trim().max(20).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  source: z.string().trim().max(40).default("website"),
});

function blankToNull(v: string | undefined | null) {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

/** Records the lead first; notifying staff is best-effort and never blocks it. */
export const submitInquiry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inquirySchema.parse(data))
  .handler(async ({ data }) => {
    const { allowRequest } = await import("./activation-guard.server");
    if (!(await allowRequest("offering-inquiry", 60))) {
      return { ok: false as const, error: "rate_limited" as const, id: null };
    }

    const client = await publicClient();
    // anon may write but never read, so the id is minted here rather than returned.
    const id = crypto.randomUUID();
    const { error } = await client
      .from("offering_inquiries")
      .insert({
        id,
        offering_id: data.offeringId ?? null,
        name: data.name,
        email: data.email,
        phone: blankToNull(data.phone),
        preferred_contact_method: data.preferredContactMethod,
        business_name: blankToNull(data.businessName),
        business_address: blankToNull(data.businessAddress),
        google_place_id: blankToNull(data.googlePlaceId),
        quantity_interest: blankToNull(data.quantityInterest),
        message: blankToNull(data.message),
        source: data.source,
      });

    if (error) { console.error("INQUIRY_INSERT_FAIL", JSON.stringify(error)); return { ok: false as const, error: "failed" as const, id: null }; }

    try {
      const { notifyAdminsOfInquiry } = await import("./inquiry-notify.server");
      await notifyAdminsOfInquiry(id);
    } catch {
      /* email is secondary — the lead already exists */
    }

    return { ok: true as const, error: null, id };
  });
