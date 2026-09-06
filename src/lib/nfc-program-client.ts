import { platform } from "@/lib/nfc-readiness";
import { detectSupport } from "@/lib/nfc-client";

/**
 * The one place that decides HOW a plaque gets programmed.
 *
 * Android with Web NFC  → the existing browser writer (unchanged).
 * iPhone / iPad         → secure native handoff to the TapLocal iOS NFC writer.
 * Anything else         → manual / another-device fallback.
 *
 * Every screen calls this instead of sniffing the user agent itself.
 */
export type NfcTransport = "web_nfc" | "ios_native" | "fallback";

export function nfcTransport(): NfcTransport {
  const device = platform();
  if (device === "ios") return "ios_native";
  const support = detectSupport();
  if (support.usable) return "web_nfc";
  return "fallback";
}

export function isIosDevice() {
  return platform() === "ios";
}

/**
 * Opens the native TapLocal NFC writer: Universal Link first, custom scheme as
 * a fallback. Resolves with whether the app appeared to take over — an iPhone
 * gives no reliable signal, so we treat a page that stayed visible as "not
 * installed" and let the caller show the install sheet.
 */
export function openNativeWriter(links: { universalLink: string; schemeLink: string }): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    let handled = false;
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        handled = true;
      }
    };
    document.addEventListener("visibilitychange", onHide);

    // 1) Universal Link — opens the app when installed, the web page when not.
    window.location.href = links.universalLink;

    // 2) Custom scheme fallback for browsers that don't honour the association.
    const schemeTimer = window.setTimeout(() => {
      if (!handled) {
        try {
          window.location.href = links.schemeLink;
        } catch {
          /* no handler registered */
        }
      }
    }, 700);

    window.setTimeout(() => {
      window.clearTimeout(schemeTimer);
      document.removeEventListener("visibilitychange", onHide);
      resolve(handled);
    }, 2000);
  });
}
