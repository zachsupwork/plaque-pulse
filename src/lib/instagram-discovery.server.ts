/**
 * Deep Instagram discovery for a real business.
 *
 * Only PUBLIC information is used: the business's own website, its public
 * structured data, and public web-search results. Finding a public profile
 * never means the owner connected it — the wording everywhere is
 * "public Instagram found", never "connected".
 *
 * Instagram itself is never crawled: it blocks anonymous automation, so
 * discovery must work without it.
 */

import type { WebSearchResult } from "./search-provider.server";

export type DiscoveryStatus = "verified" | "found" | "candidates" | "not_found" | "searching";

export type InstagramEvidence = { label: string; weight: number; source: string };

export type InstagramCandidate = {
  username: string;
  profileUrl: string;
  scope: "location" | "brand";
  confidence: number;
  verificationStatus: "verified" | "high_confidence" | "candidate" | "manual";
  source: string;
  evidence: InstagramEvidence[];
};

export type DiscoveryResult = {
  status: DiscoveryStatus;
  bestCandidate: InstagramCandidate | null;
  candidates: InstagramCandidate[];
  confidence: number;
  evidence: InstagramEvidence[];
  searchedSources: string[];
  searchedAt: string;
  websiteChecked: string | null;
  searchProvider: string | null;
  cached: boolean;
};

export const AUTO_FILL_THRESHOLD = 80;
const CANDIDATE_FLOOR = 55;
const STALE_DAYS = 45;

const RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "stories",
  "explore",
  "accounts",
  "about",
  "developer",
  "directory",
  "legal",
  "privacy",
  "terms",
  "share",
  "sharer",
  "tv",
  "web",
  "help",
  "instagram",
]);

/** @MarooOttawa | instagram.com/marooottawa/?hl=en → marooottawa */
export function normalizeInstagram(raw: string): { username: string; profileUrl: string } | null {
  const value = raw.trim();
  if (!value) return null;

  let username = value;
  if (/instagram\.com/i.test(value)) {
    const match = value.match(/instagram\.com\/([^/?#\s"'<>]+)/i);
    if (!match?.[1]) return null;
    username = match[1];
  }
  username = username.replace(/^@/, "").replace(/\/+$/, "").split("?")[0]!.trim();
  if (!/^[A-Za-z0-9_.]{2,30}$/.test(username)) return null;
  if (RESERVED.has(username.toLowerCase())) return null;

  const lower = username.toLowerCase();
  return { username: lower, profileUrl: `https://www.instagram.com/${lower}/` };
}

function tokens(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
  "the",
  "inc",
  "ltd",
  "llc",
  "co",
  "corp",
  "company",
  "restaurant",
  "cafe",
  "bar",
  "grill",
  "kitchen",
  "and",
  "of",
]);

function condense(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function domainOf(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export type BusinessContext = {
  businessId: string;
  locationId: string | null;
  googlePlaceId: string | null;
  businessName: string;
  formattedAddress: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  primaryCategory: string | null;
};

/* ------------------------------------------------------------------ */
/* Source 2 + 3 — the business's own website                           */
/* ------------------------------------------------------------------ */

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
    return (await res.text()).slice(0, 500_000);
  } catch {
    return null;
  }
}

function instagramLinksIn(html: string) {
  const found = new Set<string>();
  const matches = html.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>)]+/gi);
  for (const m of matches) {
    const normalized = normalizeInstagram(m[0]);
    if (normalized) found.add(normalized.username);
  }
  return [...found];
}

function sameAsLinksIn(html: string) {
  const found = new Set<string>();
  for (const block of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = block[1];
    if (!raw) continue;
    for (const m of raw.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>\\]+/gi)) {
      const normalized = normalizeInstagram(m[0]);
      if (normalized) found.add(normalized.username);
    }
  }
  return [...found];
}

function innerLinks(html: string, origin: string) {
  const wanted = /(contact|about|connect|social|find-us|location)/i;
  const urls = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const href = m[1];
    if (!href || !wanted.test(href)) continue;
    try {
      const resolved = new URL(href, origin);
      if (resolved.origin !== new URL(origin).origin) continue;
      urls.add(resolved.toString());
    } catch {
      /* ignore */
    }
  }
  return [...urls].slice(0, 3);
}

type WebsiteFinding = { username: string; structured: boolean };

async function scanWebsite(website: string): Promise<{ findings: WebsiteFinding[]; domain: string | null }> {
  const domain = domainOf(website);
  const home = await fetchPage(website);
  if (!home) return { findings: [], domain };

  const findings = new Map<string, WebsiteFinding>();
  for (const username of sameAsLinksIn(home)) findings.set(username, { username, structured: true });
  for (const username of instagramLinksIn(home)) {
    if (!findings.has(username)) findings.set(username, { username, structured: false });
  }

  if (findings.size === 0) {
    for (const page of innerLinks(home, website)) {
      const html = await fetchPage(page, 5000);
      if (!html) continue;
      for (const username of sameAsLinksIn(html)) findings.set(username, { username, structured: true });
      for (const username of instagramLinksIn(html)) {
        if (!findings.has(username)) findings.set(username, { username, structured: false });
      }
      if (findings.size) break;
    }
  }

  return { findings: [...findings.values()], domain };
}

/* ------------------------------------------------------------------ */
/* Source 4 — public web search                                        */
/* ------------------------------------------------------------------ */

function nameVariants(name: string) {
  const cleaned = name
    .replace(/\b(inc|ltd|llc|co|corp|corporation|company)\b\.?/gi, "")
    .replace(/[|—–-].*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const variants = new Set([name.trim(), cleaned]);
  return [...variants].filter(Boolean).slice(0, 2);
}

function searchQueries(ctx: BusinessContext, domain: string | null) {
  const queries: string[] = [];
  for (const name of nameVariants(ctx.businessName)) {
    if (ctx.city) queries.push(`site:instagram.com "${name}" "${ctx.city}"`);
    queries.push(`"${name}" Instagram ${ctx.city ?? ctx.region ?? ""}`.trim());
  }
  if (domain) queries.push(`"${domain}" Instagram`);
  if (ctx.phone) queries.push(`"${ctx.businessName}" Instagram "${ctx.phone}"`);
  return queries.slice(0, 4);
}

function scoreSearchHit(
  ctx: BusinessContext,
  username: string,
  hit: WebSearchResult,
  domain: string | null,
): { score: number; evidence: InstagramEvidence[]; scope: "location" | "brand" } {
  const evidence: InstagramEvidence[] = [];
  let score = 45;

  const haystack = `${hit.title} ${hit.snippet}`.toLowerCase();
  const nameTokens = tokens(ctx.businessName);
  const handle = condense(username);
  const matchedTokens = nameTokens.filter((t) => handle.includes(t) || haystack.includes(t));
  const nameRatio = nameTokens.length ? matchedTokens.length / nameTokens.length : 0;

  if (nameRatio >= 0.99) {
    score += 20;
    evidence.push({ label: "Business name matches", weight: 20, source: "search" });
  } else if (nameRatio >= 0.5) {
    score += 10;
    evidence.push({ label: "Business name partly matches", weight: 10, source: "search" });
  } else {
    score -= 15;
  }

  const city = ctx.city?.toLowerCase() ?? null;
  const cityInHandle = Boolean(city && handle.includes(condense(city)));
  if (city && (haystack.includes(city) || cityInHandle)) {
    score += 15;
    evidence.push({ label: `Mentions ${ctx.city}`, weight: 15, source: "search" });
  }

  if (domain && haystack.includes(domain)) {
    score += 15;
    evidence.push({ label: `Links to ${domain}`, weight: 15, source: "search" });
  }

  // A different city in the handle is a strong signal this is the wrong branch.
  const otherCity = ["toronto", "vancouver", "montreal", "calgary", "london", "newyork", "chicago", "miami"].find(
    (c) => handle.includes(c) && (!city || condense(city) !== c),
  );
  if (otherCity) {
    score -= 35;
    evidence.push({ label: "Handle points at a different city", weight: -35, source: "search" });
  }

  const scope: "location" | "brand" = cityInHandle ? "location" : "brand";
  return { score: Math.max(0, Math.min(94, score)), evidence, scope };
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

type ProfileRow = {
  id: string;
  username: string;
  profile_url: string;
  scope: string;
  confidence: number;
  verification_status: string;
  source: string;
  evidence: unknown;
  last_checked_at: string;
};

function rowToCandidate(row: ProfileRow): InstagramCandidate {
  return {
    username: row.username,
    profileUrl: row.profile_url,
    scope: row.scope === "brand" ? "brand" : "location",
    confidence: row.confidence,
    verificationStatus:
      row.verification_status === "verified"
        ? "verified"
        : row.verification_status === "manual"
          ? "manual"
          : row.verification_status === "high_confidence"
            ? "high_confidence"
            : "candidate",
    source: row.source,
    evidence: Array.isArray(row.evidence) ? (row.evidence as InstagramEvidence[]) : [],
  };
}

function isStale(iso: string) {
  return Date.now() - new Date(iso).getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;
}

export async function loadBusinessContext(businessId: string): Promise<BusinessContext | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: business } = await supabaseAdmin
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .maybeSingle();
  if (!business) return null;

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select(
      "id, address, city, province_state, country, phone, website_url, google_place_id, google_maps_uri, google_primary_type",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    businessId,
    locationId: location?.id ?? null,
    googlePlaceId: location?.google_place_id ?? null,
    businessName: business.name,
    formattedAddress: location?.address ?? null,
    city: location?.city ?? null,
    region: location?.province_state ?? null,
    country: location?.country ?? null,
    phone: location?.phone ?? null,
    website: location?.website_url ?? null,
    googleMapsUrl: location?.google_maps_uri ?? null,
    primaryCategory: location?.google_primary_type ?? null,
  };
}

/**
 * Layered discovery, cheapest first. Stops as soon as confidence is decisive so
 * the paid search API is only used when the website gave us nothing.
 */
export async function discoverInstagramForBusiness(options: {
  businessId: string;
  force?: boolean;
  deep?: boolean;
}): Promise<DiscoveryResult & { error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const searchedAt = new Date().toISOString();
  const searchedSources: string[] = [];

  const ctx = await loadBusinessContext(options.businessId);
  if (!ctx) {
    return {
      status: "not_found",
      bestCandidate: null,
      candidates: [],
      confidence: 0,
      evidence: [],
      searchedSources,
      searchedAt,
      websiteChecked: null,
      searchProvider: null,
      cached: false,
      error: "not_found",
    };
  }

  /* --- Source 1: what TapLocal already knows -------------------------- */
  const { data: saved } = await supabaseAdmin
    .from("business_social_profiles")
    .select("id, username, profile_url, scope, confidence, verification_status, source, evidence, last_checked_at")
    .eq("business_id", ctx.businessId)
    .eq("platform", "instagram")
    .order("confidence", { ascending: false });

  const rows = (saved ?? []) as ProfileRow[];
  const rejected = new Set(rows.filter((r) => r.verification_status === "rejected").map((r) => r.username));
  const trusted = rows.find((r) => ["verified", "manual"].includes(r.verification_status));
  searchedSources.push("saved");

  if (trusted && !options.force) {
    const candidate = rowToCandidate(trusted);
    return {
      status: "verified",
      bestCandidate: candidate,
      candidates: [candidate],
      confidence: Math.max(candidate.confidence, 100),
      evidence: candidate.evidence,
      searchedSources,
      searchedAt: trusted.last_checked_at,
      websiteChecked: ctx.website,
      searchProvider: null,
      cached: true,
    };
  }

  const fresh = rows.filter((r) => r.verification_status !== "rejected" && !isStale(r.last_checked_at));
  if (!options.force && !options.deep && fresh.length) {
    const candidates = fresh.map(rowToCandidate);
    const best = candidates[0]!;
    return {
      status: best.confidence >= AUTO_FILL_THRESHOLD ? "found" : "candidates",
      bestCandidate: best,
      candidates,
      confidence: best.confidence,
      evidence: best.evidence,
      searchedSources,
      searchedAt: fresh[0]!.last_checked_at,
      websiteChecked: ctx.website,
      searchProvider: null,
      cached: true,
    };
  }

  const byUsername = new Map<string, InstagramCandidate>();
  const add = (candidate: InstagramCandidate) => {
    if (rejected.has(candidate.username)) return;
    const existing = byUsername.get(candidate.username);
    if (!existing) {
      byUsername.set(candidate.username, candidate);
      return;
    }
    // Independent sources agreeing is itself evidence.
    const merged: InstagramCandidate = {
      ...existing,
      confidence: Math.min(100, Math.max(existing.confidence, candidate.confidence) + 5),
      evidence: [...existing.evidence, ...candidate.evidence],
    };
    byUsername.set(candidate.username, merged);
  };

  /* --- Sources 2 + 3: the official website ---------------------------- */
  let domain = domainOf(ctx.website);
  if (ctx.website) {
    searchedSources.push("website");
    const { findings } = await scanWebsite(ctx.website);
    domain = domainOf(ctx.website);
    for (const finding of findings) {
      const normalized = normalizeInstagram(finding.username);
      if (!normalized) continue;
      add({
        username: normalized.username,
        profileUrl: normalized.profileUrl,
        scope: "location",
        confidence: finding.structured ? 96 : 100,
        verificationStatus: "high_confidence",
        source: finding.structured ? "website_structured_data" : "official_website",
        evidence: [
          {
            label: finding.structured
              ? `Published in ${domain ?? "the website"}'s own business data`
              : `Linked from official website ${domain ?? ctx.website}`,
            weight: finding.structured ? 96 : 100,
            source: "website",
          },
        ],
      });
    }
  }

  const decisive = [...byUsername.values()].some((c) => c.confidence >= 95);

  /* --- Source 4: public web search (only when needed) ----------------- */
  const { searchProvider } = await import("./search-provider.server");
  const provider = searchProvider();
  if (!decisive && provider) {
    searchedSources.push(`search:${provider.name}`);
    for (const query of searchQueries(ctx, domain)) {
      let hits: WebSearchResult[] = [];
      try {
        hits = await provider.search(query, 8);
      } catch {
        hits = [];
      }
      for (const hit of hits) {
        const normalized = normalizeInstagram(hit.url);
        if (!normalized) continue;
        const { score, evidence, scope } = scoreSearchHit(ctx, normalized.username, hit, domain);
        if (score < CANDIDATE_FLOOR) continue;
        add({
          username: normalized.username,
          profileUrl: normalized.profileUrl,
          scope,
          confidence: score,
          verificationStatus: score >= AUTO_FILL_THRESHOLD ? "high_confidence" : "candidate",
          source: "web_search",
          evidence,
        });
      }
      if ([...byUsername.values()].some((c) => c.confidence >= 90)) break;
    }
  }

  const candidates = [...byUsername.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  const best = candidates[0] ?? null;

  /* --- Persist so we never rediscover the same account ---------------- */
  if (candidates.length) {
    const payload = candidates.map((c) => ({
      business_id: ctx.businessId,
      location_id: ctx.locationId,
      platform: "instagram",
      username: c.username,
      profile_url: c.profileUrl,
      scope: c.scope,
      confidence: c.confidence,
      verification_status: c.confidence >= AUTO_FILL_THRESHOLD ? "high_confidence" : "candidate",
      source: c.source,
      evidence: c.evidence as never,
      last_checked_at: searchedAt,
    }));
    const { error } = await supabaseAdmin
      .from("business_social_profiles")
      .upsert(payload, { onConflict: "business_id,platform,username,location_id", ignoreDuplicates: false });
    if (error) {
      // Fall back to per-row writes when the composite upsert target is unavailable.
      for (const row of payload) {
        const { data: existing } = await supabaseAdmin
          .from("business_social_profiles")
          .select("id, verification_status")
          .eq("business_id", row.business_id)
          .eq("platform", "instagram")
          .eq("username", row.username)
          .maybeSingle();
        if (existing) {
          if (["verified", "manual", "rejected"].includes(existing.verification_status)) continue;
          await supabaseAdmin
            .from("business_social_profiles")
            .update({
              confidence: row.confidence,
              scope: row.scope,
              source: row.source,
              evidence: row.evidence,
              verification_status: row.verification_status,
              last_checked_at: row.last_checked_at,
            })
            .eq("id", existing.id);
        } else {
          await supabaseAdmin.from("business_social_profiles").insert(row);
        }
      }
    }
  }

  return {
    status: !best
      ? "not_found"
      : best.confidence >= AUTO_FILL_THRESHOLD
        ? "found"
        : "candidates",
    bestCandidate: best,
    candidates,
    confidence: best?.confidence ?? 0,
    evidence: best?.evidence ?? [],
    searchedSources,
    searchedAt,
    websiteChecked: ctx.website,
    searchProvider: provider?.name ?? null,
    cached: false,
  };
}
