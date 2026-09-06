/**
 * Friendly NFC readiness layer built on top of the existing nfc-client session.
 * It never creates a second Web NFC implementation — it only asks the same
 * detectSupport()/nfcSession primitives the programming tools already use.
 *
 * A web page cannot switch the phone's NFC radio on or off. Everything here is
 * detection plus guidance.
 */

import { detectSupport, isEmbedded, nfcSession, type NfcSupport } from "@/lib/nfc-client";

export type NfcPermission = "granted" | "prompt" | "denied" | "unknown";

export type NfcReadinessState =
  | "unknown" // not checked yet
  | "ready" // Web NFC usable and permission is available
  | "attention" // supported, but NFC looks off or permission is missing
  | "unsupported" // this device/browser can never write tags on the web
  | "embedded"; // running inside the preview frame

export type NfcReadiness = {
  state: NfcReadinessState;
  support: NfcSupport;
  permission: NfcPermission;
  embedded: boolean;
  browser: string;
  detail: string | null;
};

const ONBOARDING_KEY = "nfc_onboarding_seen";
const TOOLS_KEY = "nfc_tools_enabled";

export function browserName(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (/EdgA?\//.test(ua)) return "Edge";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox/.test(ua)) return "Firefox";
  if (/Chrome/.test(ua)) return "Chrome";
  if (/Safari/.test(ua)) return "Safari";
  return "Other";
}

/** Best-effort device name, only when the browser volunteers it. */
export function deviceName(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  const android = ua.match(/Android[^;]*;\s*([^;)]+)\)/);
  if (android?.[1]) return android[1].replace(/Build.*/i, "").trim();
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  return detectSupport().device;
}

export async function readNfcPermission(): Promise<NfcPermission> {
  if (typeof navigator === "undefined" || !navigator.permissions) return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "nfc" as PermissionName });
    return status.state as NfcPermission;
  } catch {
    return "unknown";
  }
}

export function baseReadiness(permission: NfcPermission = "unknown"): NfcReadiness {
  const support = detectSupport();
  const embedded = isEmbedded();
  const browser = browserName();
  let state: NfcReadinessState = "unknown";
  let detail: string | null = null;

  if (embedded && support.hasApi) {
    state = "embedded";
    detail = "Open TapLocal in its own browser tab to use NFC.";
  } else if (!support.hasApi) {
    state = "unsupported";
    detail = "This device or browser cannot program NFC tags from the web.";
  } else if (!support.secureContext) {
    state = "attention";
    detail = "NFC needs a secure connection.";
  } else if (permission === "denied") {
    state = "attention";
    detail = "NFC is blocked for this site in your browser settings.";
  } else if (permission === "granted") {
    state = "ready";
  }
  return { state, support, permission, embedded, browser, detail };
}

/**
 * User-initiated readiness probe. Starts the normal scan flow briefly: if the
 * hardware accepts the session, NFC is on and permitted.
 */
export async function probeNfc(): Promise<{ ok: boolean; reason?: string }> {
  const support = detectSupport();
  if (!support.hasApi) return { ok: false, reason: "unsupported" };
  if (!support.secureContext) return { ok: false, reason: "insecure" };
  try {
    await nfcSession.read(2200);
    return { ok: true };
  } catch (error) {
    const name = (error as Error)?.name;
    // Timing out means the radio accepted the scan and simply saw no tag.
    if (name === "TimeoutError" || name === "AbortError") return { ok: true };
    if (name === "NotAllowedError") return { ok: false, reason: "permission" };
    if (name === "NotReadableError" || name === "NotSupportedError") return { ok: false, reason: "nfc_off" };
    return { ok: false, reason: "unknown" };
  } finally {
    nfcSession.stop();
  }
}

/** Android-only settings deep link. Returns false when we can't safely try. */
export function openNfcSettings(): boolean {
  if (typeof window === "undefined") return false;
  if (!/Android/i.test(navigator.userAgent)) return false;
  try {
    window.location.href = "intent://#Intent;action=android.settings.NFC_SETTINGS;end";
    return true;
  } catch {
    return false;
  }
}

/* -------- harmless local UX preferences (never security state) -------- */

export function onboardingSeen(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

export function markOnboardingSeen() {
  try {
    localStorage.setItem(ONBOARDING_KEY, "true");
  } catch {
    /* private mode — the card simply shows again */
  }
}

export function nfcToolsEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(TOOLS_KEY) !== "false";
}

export function setNfcToolsEnabled(on: boolean) {
  try {
    localStorage.setItem(TOOLS_KEY, on ? "true" : "false");
    window.dispatchEvent(new Event("taplocal-nfc-tools"));
  } catch {
    /* ignore */
  }
}
