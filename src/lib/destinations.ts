/**
 * What a customer should open after a tap or scan.
 *
 * IMPORTANT: none of these URLs is ever written to the physical tag. The tag always
 * carries the permanent TapLocal SmartLink (/n/[slug]); the destination below is
 * stored separately so it can be changed without touching the plaque.
 */

export type DestinationKind =
  | "google_review"
  | "instagram"
  | "website"
  | "menu"
  | "booking"
  | "facebook"
  | "tiktok"
  | "directions"
  | "call"
  | "custom";

export type DestinationOption = {
  kind: DestinationKind;
  /** Value stored in the destinations.destination_type enum. */
  dbType: string;
  label: string;
  hint: string;
  /** What the operator types, if anything. */
  input: "none" | "handle" | "url" | "phone";
  placeholder?: string;
};

export const DESTINATIONS: DestinationOption[] = [
  { kind: "google_review", dbType: "google_review", label: "Google Reviews", hint: "Opens the review box for this business", input: "none" },
  { kind: "instagram", dbType: "instagram", label: "Instagram", hint: "Profile", input: "handle", placeholder: "@business" },
  { kind: "website", dbType: "website", label: "Website", hint: "Main site", input: "url", placeholder: "https://" },
  { kind: "menu", dbType: "menu", label: "Menu", hint: "Menu or ordering page", input: "url", placeholder: "https://" },
  { kind: "booking", dbType: "booking", label: "Booking", hint: "Reservations", input: "url", placeholder: "https://" },
  { kind: "facebook", dbType: "facebook", label: "Facebook", hint: "Page", input: "handle", placeholder: "yourpage" },
  { kind: "tiktok", dbType: "custom", label: "TikTok", hint: "Profile", input: "handle", placeholder: "@business" },
  { kind: "directions", dbType: "directions", label: "Directions", hint: "Google Maps listing", input: "none" },
  { kind: "call", dbType: "call", label: "Call", hint: "Phone number", input: "phone", placeholder: "+1 613 555 0100" },
  { kind: "custom", dbType: "custom", label: "Custom link", hint: "Paste any link", input: "url", placeholder: "https://" },
];

export function destinationOption(kind: DestinationKind) {
  return DESTINATIONS.find((d) => d.kind === kind)!;
}

export function destinationLabel(kindOrType: string) {
  return (
    DESTINATIONS.find((d) => d.kind === kindOrType)?.label ??
    DESTINATIONS.find((d) => d.dbType === kindOrType)?.label ??
    kindOrType.replace(/_/g, " ")
  );
}

function handle(value: string) {
  return value.trim().replace(/^@/, "").replace(/\/+$/, "");
}

/** Turns whatever the operator typed into a real, safe destination URL. */
export function buildDestinationUrl(kind: DestinationKind, raw: string): string | null {
  const value = raw.trim();
  switch (kind) {
    case "instagram":
      if (!value) return null;
      if (/^https?:\/\//i.test(value)) return safeUrl(value);
      return `https://www.instagram.com/${handle(value)}/`;
    case "facebook":
      if (!value) return null;
      if (/^https?:\/\//i.test(value)) return safeUrl(value);
      return `https://www.facebook.com/${handle(value)}`;
    case "tiktok":
      if (!value) return null;
      if (/^https?:\/\//i.test(value)) return safeUrl(value);
      return `https://www.tiktok.com/@${handle(value)}`;
    case "call": {
      const digits = value.replace(/[^\d+]/g, "");
      return digits.length >= 7 ? `tel:${digits}` : null;
    }
    case "google_review":
    case "directions":
      return null; // derived on the server from the Google listing
    default:
      return safeUrl(value);
  }
}

/** Only ever accept a normal web link. */
export function safeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const PLACEMENTS = [
  "Front Counter",
  "Checkout",
  "Table",
  "Entrance",
  "Host Stand",
  "Bar",
  "Reception",
  "Waiting Area",
  "Service Desk",
  "Other",
] as const;
