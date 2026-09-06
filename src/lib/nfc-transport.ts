/**
 * Centralised configuration for NFC programming transports.
 *
 * The physical tag always receives a permanent TapLocal SmartLink built by
 * `smartlink.ts`. This module only decides *how* the write is performed and
 * where the handoff links live, so moving from taplocaldigital.lovable.app to
 * taplocaldigital.com later is a one-line change here.
 */

import { SMARTLINK_FALLBACK_ORIGIN } from "@/lib/smartlink";

function clean(value: string) {
  return value.trim().replace(/\/+$/, "");
}

/** Where the TapLocal web app itself lives (admin, setup, return pages). */
export function publicAppOrigin(): string {
  const configured =
    (import.meta.env?.["VITE_PUBLIC_APP_ORIGIN"] as string | undefined) ??
    (import.meta.env?.["VITE_SMARTLINK_BASE_URL"] as string | undefined) ??
    "";
  if (configured.trim()) return clean(configured);
  if (typeof process !== "undefined") {
    const server = process.env?.["PUBLIC_APP_ORIGIN"] ?? process.env?.["SMARTLINK_BASE_URL"] ?? "";
    if (server.trim()) return clean(server);
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    if (/^https:\/\//.test(origin) && !/localhost|127\.0\.0\.1/.test(origin)) return clean(origin);
  }
  return SMARTLINK_FALLBACK_ORIGIN;
}

/**
 * Origin used for the iOS Universal Link that opens the TapLocal NFC writer.
 * Defaults to the app origin so development and production behave the same.
 */
export function nfcHandoffOrigin(): string {
  const configured = (import.meta.env?.["VITE_NFC_HANDOFF_ORIGIN"] as string | undefined) ?? "";
  if (configured.trim()) return clean(configured);
  if (typeof process !== "undefined") {
    const server = process.env?.["NFC_HANDOFF_ORIGIN"] ?? "";
    if (server.trim()) return clean(server);
  }
  return publicAppOrigin();
}

/** Universal Link the TapLocal iOS companion claims. Also a real web page. */
export function nfcProgramUniversalLink(token: string) {
  return `${nfcHandoffOrigin()}/nfc/program/${token}`;
}

/** Custom-scheme fallback for devices where the Universal Link doesn't resolve. */
export function nfcProgramSchemeLink(token: string) {
  return `taplocal://nfc/program?token=${encodeURIComponent(token)}`;
}

/** Where the native writer sends the phone back to. Server holds the state. */
export function nfcReturnUrl(sessionId: string) {
  return `${publicAppOrigin()}/nfc/return/${sessionId}`;
}

/** How a tag was written. Kept identical across platforms for reporting. */
export type ProgrammingMethod = "android_web_nfc" | "ios_core_nfc" | "external_manual" | "manufacturing";

/** One shared programming status vocabulary for every platform. */
export type ProgrammingState =
  | "not_programmed"
  | "programming"
  | "programmed_unverified"
  | "verified"
  | "preprogrammed"
  | "needs_attention";

export const PROGRAMMING_STATE_LABEL: Record<ProgrammingState, string> = {
  not_programmed: "NOT PROGRAMMED",
  programming: "PROGRAMMING…",
  programmed_unverified: "PROGRAMMED — UNVERIFIED",
  verified: "VERIFIED ✓",
  preprogrammed: "PREPROGRAMMED ✓",
  needs_attention: "NEEDS ATTENTION",
};

/** Friendly text for every failure the native writer can report. */
export const NATIVE_ERROR_MESSAGE: Record<string, string> = {
  tag_not_found: "Hold the top of your iPhone close to the NFC tag.",
  tag_read_only: "This NFC tag cannot be rewritten.",
  tag_too_small: "Use a compatible TapLocal NFC tag.",
  session_expired: "This programming session expired.",
  mismatch: "NFC verification did not match the expected TapLocal SmartLink.",
  cancelled: "The NFC session was closed before the tag was written.",
  unknown: "The tag could not be programmed. Try again.",
};
