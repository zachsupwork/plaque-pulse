/**
 * SmartLink URL building.
 *
 * The physical tag only ever carries a permanent TapLocal link. That link must resolve,
 * so the base origin is configurable and falls back to a host that is actually live —
 * never to a domain that has not been set up yet.
 */

/** The production SmartLink domain we intend to use once DNS is configured. */
export const SMARTLINK_PRODUCTION_ORIGIN = "https://go.taplocaldigital.com";

/** Where the app is published today. Always resolvable, used until the short domain is live. */
export const SMARTLINK_FALLBACK_ORIGIN = "https://taplocaldigital.lovable.app";

function clean(value: string) {
  return value.trim().replace(/\/+$/, "");
}

/** Resolved SmartLink origin for the current environment. */
export function smartlinkBase(): string {
  const configured = (import.meta.env?.["VITE_SMARTLINK_BASE_URL"] as string | undefined) ?? "";
  if (configured.trim()) return clean(configured);

  if (typeof process !== "undefined") {
    const serverConfigured = process.env?.["SMARTLINK_BASE_URL"] ?? "";
    if (serverConfigured.trim()) return clean(serverConfigured);
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    // Never mint links against a sandbox/local origin — those are not reachable from a phone.
    const origin = window.location.origin;
    if (/^https:\/\//.test(origin) && !/localhost|127\.0\.0\.1/.test(origin)) return clean(origin);
  }

  return SMARTLINK_FALLBACK_ORIGIN;
}

/** True once SmartLinks are being minted on the production short domain. */
export function isProductionSmartlinkDomain(): boolean {
  return smartlinkBase() === SMARTLINK_PRODUCTION_ORIGIN;
}

/** Label for the badge shown next to any link built on a non-production origin. */
export function smartlinkEnvironmentLabel(): "Production SmartLink" | "Development SmartLink" {
  return isProductionSmartlinkDomain() ? "Production SmartLink" : "Development SmartLink";
}

export function nfcUrl(slug: string) {
  return `${smartlinkBase()}/n/${slug}`;
}

export function qrUrl(slug: string) {
  return `${smartlinkBase()}/q/${slug}`;
}

/** Manufacturing test taps carry this flag so they never count as customer engagement. */
export function testUrl(url: string) {
  return `${url}${url.includes("?") ? "&" : "?"}tl_test=1`;
}

/** Extracts the slug from a TapLocal SmartLink (nfc or qr), else null. Host-agnostic. */
export function parseSmartLink(raw: string): { slug: string; kind: "nfc" | "qr" } | null {
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/^\/(n|q)\/([A-Za-z0-9_-]{4,32})\/?$/);
    if (!match) return null;
    return { slug: match[2]!, kind: match[1] === "q" ? "qr" : "nfc" };
  } catch {
    return null;
  }
}

/** A tag written against an older/other origin still points at the same plaque. */
export function sameSmartLink(a: string, b: string) {
  const pa = parseSmartLink(a);
  const pb = parseSmartLink(b);
  if (pa && pb) return pa.slug === pb.slug && pa.kind === pb.kind;
  return clean(a) === clean(b);
}
