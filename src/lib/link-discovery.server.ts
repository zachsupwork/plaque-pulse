/**
 * Public business-link discovery (server only).
 *
 * Only PUBLIC data is used: the business's own Google listing, its own website,
 * and public web-search results. Finding a link never means the owner connected
 * anything — wording stays "found", never "connected".
 *
 * Instagram is intentionally NOT handled here; it has its own discovery system
 * in instagram-discovery.server.ts and must not be duplicated.
 */

import type { BusinessContext } from "./instagram-discovery.server";

export type LinkKind = "website" | "menu" | "booking" | "facebook" | "tiktok";

export type LinkCandidate = {
  url: string;
  label: string;
  /** Plain-language origin of the value, shown to the admin. */
  source: string;
  confidence: number;
};

export type LinkResult = {
  kind: LinkKind;
  status: "found" | "possible" | "not_found";
  candidates: LinkCandidate[];
  websiteChecked: string | null;
};

/** Never treated as an official business website. */
const AGGREGATORS = [
  "ubereats.com",
  "doordash.com",
  "skipthedishes.com",
  "grubhub.com",
  "yelp.com",
  "tripadvisor.com",
  "tripadvisor.ca",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "linkedin.com",
  "google.com",
  "goo.gl",
  "g.page",
  "menupages.com",
  "zomato.com",
  "opentable.com",
  "restaurantji.com",
  "yellowpages.ca",
  "foursquare.com",
];

const BOOKING_HOSTS = [
  "opentable.com",
  "opentable.ca",
  "resy.com",
  "exploretock.com",
  "sevenrooms.com",
  "calendly.com",
  "booksy.com",
  "squareup.com",
  "setmore.com",
  "acuityscheduling.com",
  "fresha.com",
  "mindbodyonline.com",
  "getthetable.com",
  "tablecheck.com",
];

const MENU_HOSTS = ["ubereats.com", "doordash.com", "skipthedishes.com", "toasttab.com", "clover.com", "square.site"];

export function hostOf(url: string | null | undefined) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isAggregator(url: string) {
  const host = hostOf(url);
  return Boolean(host && AGGREGATORS.some((a) => host === a || host.endsWith(`.${a}`)));
}

function matchesHost(url: string, list: string[]) {
  const host = hostOf(url);
  return Boolean(host && list.some((a) => host === a || host.endsWith(`.${a}`)));
}

async function fetchPage(url: string, timeoutMs = 6000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "TapLocalBot/1.0 (+https://taplocaldigital.lovable.app)" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.text()).slice(0, 400_000);
  } catch {
    return null;
  }
}

function allLinks(html: string, base: string) {
  const urls = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'\s]+)["']/gi)) {
    const href = m[1];
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      urls.add(new URL(href, base).toString());
    } catch {
      /* ignore */
    }
  }
  return [...urls].slice(0, 400);
}

function linkText(html: string, url: string) {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = html.match(new RegExp(`href=["']${escaped}["'][^>]*>([^<]{0,60})`, "i"));
  return m?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function tokensOf(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 2);
}

/* ------------------------------------------------------------------ */
/* Website                                                             */
/* ------------------------------------------------------------------ */

/** Scores a candidate official website against the exact business identity. */
function scoreWebsite(ctx: BusinessContext, url: string, haystack: string) {
  const host = hostOf(url);
  if (!host) return 0;
  let score = 40;
  const condensed = host.replace(/[^a-z0-9]/g, "");
  const nameTokens = tokensOf(ctx.businessName);
  const matched = nameTokens.filter((t) => condensed.includes(t));
  if (nameTokens.length && matched.length === nameTokens.length) score += 30;
  else if (matched.length) score += 15;
  else score -= 15;

  const text = haystack.toLowerCase();
  if (ctx.city && text.includes(ctx.city.toLowerCase())) score += 12;
  if (ctx.phone) {
    const digits = ctx.phone.replace(/\D/g, "").slice(-7);
    if (digits && text.replace(/\D/g, "").includes(digits)) score += 18;
  }
  if (ctx.formattedAddress) {
    const streetNumber = ctx.formattedAddress.match(/^\d+/)?.[0];
    if (streetNumber && text.includes(streetNumber)) score += 8;
  }
  return Math.max(0, Math.min(94, score));
}

async function searchWebsite(ctx: BusinessContext): Promise<LinkCandidate[]> {
  const { searchProvider } = await import("./search-provider.server");
  const provider = searchProvider();
  if (!provider) return [];

  const queries = [
    `"${ctx.businessName}" ${ctx.formattedAddress ?? ctx.city ?? ""} official website`.trim(),
    `"${ctx.businessName}" ${ctx.city ?? ""} website`.trim(),
  ];

  const found = new Map<string, LinkCandidate>();
  for (const query of queries) {
    let hits: Awaited<ReturnType<typeof provider.search>> = [];
    try {
      hits = await provider.search(query, 8);
    } catch {
      continue;
    }
    for (const hit of hits) {
      if (isAggregator(hit.url)) continue;
      const host = hostOf(hit.url);
      if (!host || found.has(host)) continue;
      const confidence = scoreWebsite(ctx, hit.url, `${hit.title} ${hit.snippet}`);
      if (confidence < 55) continue;
      found.set(host, {
        url: `https://${host}/`,
        label: host,
        source: "Public web search",
        confidence,
      });
    }
    if ([...found.values()].some((c) => c.confidence >= 80)) break;
  }
  return [...found.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* Website-derived links: menu / booking / facebook / tiktok           */
/* ------------------------------------------------------------------ */

function classify(kind: LinkKind, url: string, text: string): LinkCandidate | null {
  const host = hostOf(url);
  if (!host) return null;
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const label = text || host;

  if (kind === "facebook") {
    if (!/(^|\.)facebook\.com$/.test(host)) return null;
    if (/(sharer|share\.php|plugins|dialog)/.test(path + url)) return null;
    return { url, label, source: "Linked from the official website", confidence: 88 };
  }
  if (kind === "tiktok") {
    if (!/(^|\.)tiktok\.com$/.test(host)) return null;
    return { url, label, source: "Linked from the official website", confidence: 85 };
  }
  if (kind === "menu") {
    const isOwn = /menu|our-food|food|drinks/.test(path) || /menu/i.test(text);
    if (matchesHost(url, MENU_HOSTS)) {
      return { url, label: `${label} (ordering)`, source: `Ordering page on ${host}`, confidence: 70 };
    }
    if (!isOwn) return null;
    const pdf = path.endsWith(".pdf");
    return {
      url,
      label: pdf ? `${label || "Menu"} (PDF)` : label || "Menu",
      source: "Menu page on the official website",
      confidence: pdf ? 82 : 86,
    };
  }
  if (kind === "booking") {
    if (matchesHost(url, BOOKING_HOSTS)) {
      return { url, label: label || host, source: `Reservation link on ${host}`, confidence: 84 };
    }
    if (/(reserv|book|appointment|order-online)/.test(path) || /(reserve|book|appointment)/i.test(text)) {
      return { url, label: label || "Booking", source: "Booking page on the official website", confidence: 78 };
    }
    return null;
  }
  return null;
}

async function fromWebsite(kind: LinkKind, website: string): Promise<LinkCandidate[]> {
  const home = await fetchPage(website);
  if (!home) return [];
  const out = new Map<string, LinkCandidate>();
  for (const url of allLinks(home, website)) {
    const candidate = classify(kind, url, linkText(home, url));
    if (candidate && !out.has(candidate.url)) out.set(candidate.url, candidate);
  }
  return [...out.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

export async function discoverLinkFor(
  ctx: BusinessContext,
  kind: LinkKind,
  deep: boolean,
): Promise<LinkResult> {
  const websiteChecked = ctx.website ?? null;

  if (kind === "website") {
    if (ctx.website && !isAggregator(ctx.website)) {
      return {
        kind,
        status: "found",
        websiteChecked,
        candidates: [
          {
            url: ctx.website,
            label: hostOf(ctx.website) ?? ctx.website,
            source: "Google business listing",
            confidence: 96,
          },
        ],
      };
    }
    if (!deep) return { kind, status: "not_found", candidates: [], websiteChecked };
    const candidates = await searchWebsite(ctx);
    return {
      kind,
      status: candidates.length ? (candidates[0]!.confidence >= 80 ? "found" : "possible") : "not_found",
      candidates,
      websiteChecked,
    };
  }

  const candidates = ctx.website ? await fromWebsite(kind, ctx.website) : [];
  if (candidates.length) {
    return {
      kind,
      status: candidates[0]!.confidence >= 80 ? "found" : "possible",
      candidates,
      websiteChecked,
    };
  }
  return { kind, status: "not_found", candidates: [], websiteChecked };
}
