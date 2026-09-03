/** Canonical public SmartLink origin. The physical tag only ever carries this URL. */
export const SMARTLINK_ORIGIN = "https://go.taplocaldigital.com";

export function nfcUrl(slug: string) {
  return `${SMARTLINK_ORIGIN}/n/${slug}`;
}

export function qrUrl(slug: string) {
  return `${SMARTLINK_ORIGIN}/q/${slug}`;
}

/** Manufacturing test taps carry this flag so they never count as customer engagement. */
export function testUrl(url: string) {
  return `${url}${url.includes("?") ? "&" : "?"}tl_test=1`;
}

/** Extracts the slug from a TapLocal SmartLink (nfc or qr), else null. */
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
