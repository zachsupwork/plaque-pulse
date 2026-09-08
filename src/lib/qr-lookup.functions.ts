import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { extractSmartLinkSlug } from "@/lib/smartlink";

/**
 * Reverse lookup for physical production.
 *
 * A printed QR must never become an orphan: given the link, the path, the slug or the
 * plaque code, this resolves the exact plaque record server-side. It deliberately does
 * NOT go through /q/[slug], so admin identification never creates a customer interaction.
 */

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type QrLookupMatch = {
  plaqueId: string;
  plaqueCode: string;
  slug: string;
  plaqueName: string | null;
  status: string;
  placement: string | null;
  batchId: string | null;
  productType: string;
  style: string | null;
  baseType: string | null;
  businessId: string | null;
  businessName: string | null;
  locationId: string | null;
  locationName: string | null;
  address: string | null;
  city: string | null;
  placeKey: string | null;
  destinationType: string | null;
  destinationUrl: string | null;
  writeStatus: string;
  verificationStatus: string;
  designLabel: string | null;
  print: {
    printedAt: string;
    batchId: string | null;
    position: number | null;
    designName: string | null;
    designVersion: string | null;
    encodedUrl: string;
  } | null;
  printCount: number;
  warnings: { level: "critical" | "warning"; title: string; detail: string }[];
};

export const lookupSmartLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ query: z.string().min(1).max(400) }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, match: null, parsed: null };

    const raw = data.query.trim();
    const parsedLink = extractSmartLinkSlug(raw);
    const client = await db();

    // Try slug first, then plaque code — both are printed on TapLocal QR sheets.
    const candidateSlug = parsedLink?.slug ?? raw;
    const { data: bySlug } = await client
      .from("plaques")
      .select(
        "id, plaque_code, public_slug, plaque_name, placement_type, product_type, style, base_type, batch_id, status, business_id, location_id",
      )
      .eq("public_slug", candidateSlug)
      .limit(5);

    let rows = bySlug ?? [];
    if (!rows.length) {
      const { data: byCode } = await client
        .from("plaques")
        .select(
          "id, plaque_code, public_slug, plaque_name, placement_type, product_type, style, base_type, batch_id, status, business_id, location_id",
        )
        .ilike("plaque_code", candidateSlug)
        .limit(5);
      rows = byCode ?? [];
    }

    if (!rows.length) {
      return {
        ok: true as const,
        error: null,
        parsed: { slug: parsedLink?.slug ?? null, kind: parsedLink?.kind ?? null, input: raw },
        match: null,
      };
    }

    const plaque = rows[0]!;

    const [{ data: business }, { data: location }, { data: dest }, { data: prog }, { data: prints }, { data: slugTwins }] =
      await Promise.all([
        plaque.business_id
          ? client.from("businesses").select("id, name").eq("id", plaque.business_id).maybeSingle()
          : Promise.resolve({ data: null }),
        plaque.location_id
          ? client.from("locations").select("id, name, address, city").eq("id", plaque.location_id).maybeSingle()
          : Promise.resolve({ data: null }),
        client
          .from("destinations")
          .select("destination_type, url")
          .eq("plaque_id", plaque.id)
          .is("effective_to", null)
          .maybeSingle(),
        client
          .from("plaque_programming")
          .select("write_status, verification_status, batch_id, expected_nfc_url")
          .eq("plaque_id", plaque.id)
          .maybeSingle(),
        client
          .from("qr_print_records")
          .select("printed_at, batch_id, print_position, design_name, design_version, encoded_url")
          .eq("plaque_id", plaque.id)
          .order("printed_at", { ascending: false })
          .limit(20),
        client.from("plaques").select("id, plaque_code").eq("public_slug", plaque.public_slug),
      ]);

    const warnings: QrLookupMatch["warnings"] = [];
    if ((slugTwins ?? []).length > 1) {
      warnings.push({
        level: "critical",
        title: "CRITICAL QR MISMATCH",
        detail: `Slug ${plaque.public_slug} is attached to ${(slugTwins ?? []).length} plaques: ${(slugTwins ?? [])
          .map((t) => t.plaque_code)
          .join(", ")}. Every plaque must own exactly one permanent SmartLink.`,
      });
    }

    const expectedQrPath = `/q/${plaque.public_slug}`;
    const badPrint = (prints ?? []).find((p) => !p.encoded_url.includes(expectedQrPath));
    if (badPrint) {
      warnings.push({
        level: "critical",
        title: "QR MISMATCH — FIX BEFORE PRINTING",
        detail: `A print record encodes ${badPrint.encoded_url}, which is not ${expectedQrPath}.`,
      });
    }
    if (parsedLink?.slug && parsedLink.slug !== plaque.public_slug) {
      warnings.push({
        level: "warning",
        title: "Matched by plaque code",
        detail: `The pasted value did not match a slug; this plaque's permanent slug is ${plaque.public_slug}.`,
      });
    }

    const latest = (prints ?? [])[0] ?? null;
    const match: QrLookupMatch = {
      plaqueId: plaque.id,
      plaqueCode: plaque.plaque_code,
      slug: plaque.public_slug,
      plaqueName: plaque.plaque_name,
      status: plaque.status,
      placement: plaque.placement_type,
      batchId: plaque.batch_id ?? prog?.batch_id ?? null,
      productType: plaque.product_type,
      style: plaque.style,
      baseType: plaque.base_type,
      businessId: plaque.business_id,
      businessName: business?.name ?? null,
      locationId: location?.id ?? null,
      locationName: location?.name ?? null,
      address: location?.address ?? null,
      city: location?.city ?? null,
      placeKey: location?.id ?? (plaque.business_id ? `b_${plaque.business_id}` : null),
      destinationType: dest?.destination_type ?? null,
      destinationUrl: dest?.url ?? null,
      writeStatus: prog?.write_status ?? "not_programmed",
      verificationStatus: prog?.verification_status ?? "unverified",
      designLabel:
        latest?.design_name ??
        [business?.name, plaque.plaque_name, plaque.style].filter(Boolean).join(" — ") ??
        null,
      print: latest
        ? {
            printedAt: latest.printed_at,
            batchId: latest.batch_id,
            position: latest.print_position,
            designName: latest.design_name,
            designVersion: latest.design_version,
            encodedUrl: latest.encoded_url,
          }
        : null,
      printCount: (prints ?? []).length,
      warnings,
    };

    return {
      ok: true as const,
      error: null,
      parsed: { slug: parsedLink?.slug ?? null, kind: parsedLink?.kind ?? null, input: raw },
      match,
    };
  });

/** Logs that a QR sheet was produced, so a printed code can always be traced later. */
export const recordQrPrint = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        plaqueId: z.string().uuid(),
        encodedUrl: z.string().min(4).max(600),
        batchId: z.string().max(80).optional(),
        printPosition: z.number().int().min(1).max(100000).optional(),
        designName: z.string().max(160).optional(),
        designVersion: z.string().max(40).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, public_slug, batch_id")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque) return { ok: false as const, error: "not_found" as const };

    if (!data.encodedUrl.includes(`/q/${plaque.public_slug}`)) {
      return { ok: false as const, error: "qr_mismatch" as const };
    }

    await client.from("qr_print_records").insert({
      plaque_id: plaque.id,
      slug: plaque.public_slug,
      encoded_url: data.encodedUrl,
      batch_id: data.batchId ?? plaque.batch_id ?? null,
      print_position: data.printPosition ?? null,
      design_name: data.designName ?? null,
      design_version: data.designVersion ?? "V1",
      printed_by_user_id: caller.userId,
    });

    return { ok: true as const, error: null };
  });
