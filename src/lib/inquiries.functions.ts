import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { OfferingMeta } from "./offerings.functions";

/**
 * Staff-only lead management and catalog editing. Every function verifies the
 * caller holds the TapLocal admin role with their own session before the
 * privileged client is ever loaded.
 */

type Denied = { ok: false; error: "unauthorized" | "forbidden" };

async function gate(): Promise<{ ok: true; userId: string } | Denied> {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const STATUSES = ["new", "contacted", "qualified", "follow_up", "won", "not_interested", "closed"] as const;
export type InquiryStatus = (typeof STATUSES)[number];

const INQUIRY_COLUMNS =
  "id, offering_id, name, email, phone, preferred_contact_method, business_name, business_address, google_place_id, quantity_interest, message, source, status, created_at, updated_at, contacted_at, closed_at, business_id";

/** Counts per status, for the admin dashboard badge and the tab bar. */
export const inquiryCounts = createServerFn({ method: "POST" }).handler(async () => {
  const caller = await gate();
  if (!caller.ok) return { ok: false as const, error: caller.error, counts: {} as Record<string, number> };

  const client = await db();
  const { data } = await client.from("offering_inquiries").select("status");
  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return { ok: true as const, error: null, counts };
});

export const listInquiries = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ statuses: z.array(z.enum(STATUSES)).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, items: [] };

    const client = await db();
    let q = client
      .from("offering_inquiries")
      .select(INQUIRY_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.statuses?.length) q = q.in("status", data.statuses);
    const { data: rows } = await q;

    const offeringIds = [...new Set((rows ?? []).map((r) => r.offering_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (offeringIds.length) {
      const { data: offerings } = await client.from("offerings").select("id, name").in("id", offeringIds);
      for (const o of offerings ?? []) names.set(o.id, o.name);
    }

    return {
      ok: true as const,
      error: null,
      items: (rows ?? []).map((r) => ({
        ...r,
        offering_name: r.offering_id ? (names.get(r.offering_id) ?? null) : null,
      })),
    };
  });

export const getInquiry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, inquiry: null };

    const client = await db();
    const { data: row } = await client
      .from("offering_inquiries")
      .select(INQUIRY_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: false as const, error: "forbidden" as const, inquiry: null };

    let offeringName: string | null = null;
    let offeringMeta: OfferingMeta = {};
    if (row.offering_id) {
      const { data: o } = await client
        .from("offerings")
        .select("name, metadata")
        .eq("id", row.offering_id)
        .maybeSingle();
      offeringName = o?.name ?? null;
      offeringMeta = (o?.metadata as OfferingMeta | null) ?? {};
    }

    return { ok: true as const, error: null, inquiry: { ...row, offering_name: offeringName, offering_metadata: offeringMeta } };
  });

export const setInquiryStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(STATUSES) }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };

    const client = await db();
    const now = new Date().toISOString();
    const closing = data.status === "closed" || data.status === "not_interested" || data.status === "won";
    const patch = {
      status: data.status,
      ...(data.status === "contacted" ? { contacted_at: now } : {}),
      ...(closing ? { closed_at: now } : {}),
    };
    const { error } = await client.from("offering_inquiries").update(patch).eq("id", data.id);
    return error ? { ok: false as const, error: "forbidden" as const } : { ok: true as const, error: null };
  });

/** Field sales: log what a prospect said they wanted, straight from Admin. */
export const createAdminInquiry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        offeringId: z.string().uuid().nullable().optional(),
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(255),
        phone: z.string().trim().max(40).optional(),
        businessName: z.string().trim().max(200).optional(),
        quantityInterest: z.string().trim().max(20).optional(),
        message: z.string().trim().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, id: null };

    const client = await db();
    const { data: row, error } = await client
      .from("offering_inquiries")
      .insert({
        offering_id: data.offeringId ?? null,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        business_name: data.businessName || null,
        quantity_interest: data.quantityInterest || null,
        message: data.message || null,
        source: "admin_sales",
      })
      .select("id")
      .single();
    return error || !row
      ? { ok: false as const, error: "forbidden" as const, id: null }
      : { ok: true as const, error: null, id: row.id as string };
  });

/* ---------------------------------- catalog --------------------------------- */

const OFFERING_COLUMNS =
  "id, name, slug, category, short_description, full_description, image_url, icon, active, featured, sort_order, cta_label, starting_price_text, metadata, created_at";

export const adminListOfferings = createServerFn({ method: "POST" }).handler(async () => {
  const caller = await gate();
  if (!caller.ok) return { ok: false as const, error: caller.error, offerings: [] };

  const client = await db();
  const { data } = await client.from("offerings").select(OFFERING_COLUMNS).order("sort_order");
  return { ok: true as const, error: null, offerings: data ?? [] };
});

const offeringInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes"),
  category: z.enum(["smartplaques", "services", "packages", "custom"]),
  short_description: z.string().trim().max(300).default(""),
  full_description: z.string().trim().max(4000).optional(),
  image_url: z.string().trim().max(600).optional(),
  cta_label: z.string().trim().min(1).max(60).default("I'm interested"),
  starting_price_text: z.string().trim().max(60).optional(),
  sort_order: z.number().int().min(0).max(9999).default(100),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  tagline: z.string().trim().max(120).optional(),
  features: z.array(z.string().trim().max(200)).max(20).optional(),
  finishes: z.array(z.string().trim().max(80)).max(12).optional(),
  bases: z.array(z.string().trim().max(80)).max(12).optional(),
  quantities: z.array(z.string().trim().max(40)).max(12).optional(),
  gallery: z.array(z.string().trim().max(600)).max(12).optional(),
});

export const saveOffering = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => offeringInput.parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };

    const client = await db();
    const existing = data.id
      ? ((await client.from("offerings").select("metadata").eq("id", data.id).maybeSingle()).data
          ?.metadata as Record<string, unknown> | null)
      : null;
    const metadata: Record<string, unknown> = { ...(existing ?? {}) };
    const applyList = (key: string, list?: string[]) => {
      if (!list) return;
      const clean = list.map((v) => v.trim()).filter(Boolean);
      if (clean.length) metadata[key] = clean;
      else delete metadata[key];
    };
    if (data.tagline !== undefined) {
      if (data.tagline) metadata.tagline = data.tagline;
      else delete metadata.tagline;
    }
    applyList("features", data.features);
    applyList("finishes", data.finishes);
    applyList("bases", data.bases);
    applyList("quantities", data.quantities);
    if (data.gallery) {
      const clean = data.gallery.map((v) => v.trim()).filter(Boolean).map((url) => ({ url }));
      if (clean.length) metadata.gallery = clean;
      else delete metadata.gallery;
    }
    const row = {
      name: data.name,
      slug: data.slug,
      category: data.category,
      short_description: data.short_description,
      full_description: data.full_description || null,
      image_url: data.image_url || null,
      cta_label: data.cta_label,
      starting_price_text: data.starting_price_text || null,
      sort_order: data.sort_order,
      active: data.active,
      featured: data.featured,
      metadata,
    };
    const { error } = data.id
      ? await client.from("offerings").update(row).eq("id", data.id)
      : await client.from("offerings").insert(row);
    return error ? { ok: false as const, error: "forbidden" as const } : { ok: true as const, error: null };
  });

export const setOfferingActive = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();
    const { error } = await client.from("offerings").update({ active: data.active }).eq("id", data.id);
    return error ? { ok: false as const, error: "forbidden" as const } : { ok: true as const, error: null };
  });
