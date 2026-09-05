import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public business discovery. Reads Google's PUBLIC listing data only — it identifies
 * a business, it never proves the caller owns it. Rate limited because Google costs money.
 */

export const searchBusinesses = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ query: z.string().min(3).max(120), sessionToken: z.string().min(6).max(64) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { allowRequest } = await import("./activation-guard.server");
    if (!(await allowRequest("places-search", 60))) {
      return { ok: false as const, error: "rate_limited" as const, results: [] };
    }

    const { autocompleteBusinesses } = await import("./google-places.server");
    try {
      return { ok: true as const, error: null, results: await autocompleteBusinesses(data.query, data.sessionToken) };
    } catch {
      return { ok: false as const, error: "not_configured" as const, results: [] };
    }
  });

export const getBusinessDetails = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ placeId: z.string().min(4).max(300), sessionToken: z.string().min(6).max(64).optional() })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { allowRequest } = await import("./activation-guard.server");
    if (!(await allowRequest("places-details", 40))) return { ok: false as const, place: null, socials: [] };

    const { placeDetails } = await import("./google-places.server");
    let place = null;
    try {
      place = await placeDetails(data.placeId, data.sessionToken);
    } catch {
      return { ok: false as const, place: null, socials: [] };
    }
    if (!place) return { ok: false as const, place: null, socials: [] };

    const socials = place.website ? await discoverSocials(place.website) : [];
    return { ok: true as const, place, socials };
  });

/**
 * Best-effort: read the business's own website and collect the social links it publishes.
 * A link only counts when the business itself links to it — we never match on name.
 */
async function discoverSocials(website: string) {
  const platforms: Array<{ platform: string; pattern: RegExp }> = [
    { platform: "instagram", pattern: /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})/i },
    { platform: "facebook", pattern: /https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9_.\-]{2,60})/i },
    { platform: "tiktok", pattern: /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]{2,30})/i },
    { platform: "youtube", pattern: /https?:\/\/(?:www\.)?youtube\.com\/(@[A-Za-z0-9_.\-]{2,40})/i },
    { platform: "linkedin", pattern: /https?:\/\/(?:www\.)?linkedin\.com\/company\/([A-Za-z0-9_.\-]{2,60})/i },
  ];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(website, { signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    if (!res.ok) return [];
    const html = (await res.text()).slice(0, 400_000);

    const found: Array<{ platform: string; handle: string; url: string }> = [];
    for (const { platform, pattern } of platforms) {
      const match = html.match(pattern);
      if (match?.[1] && !["p", "share", "sharer", "tr", "profile.php"].includes(match[1])) {
        found.push({ platform, handle: match[1], url: match[0] });
      }
    }
    return found;
  } catch {
    return [];
  }
}
