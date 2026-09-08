/**
 * Lock-screen notification layer for TapLocal NFC taps.
 *
 * Deliberately layered so the SmartLink logic stays shared:
 *   - the URL always comes from nfcUrl(slug) — the same /n/{slug} route the tag carries;
 *   - the ANDROID-SPECIFIC part is isolated behind an optional native bridge
 *     (window.TapLocalNative) that a future Android wrapper can provide;
 *   - the web path uses a plain, standards-compliant notification through the
 *     service worker. No full-screen intents, overlays or lock-screen bypasses:
 *     Android decides whether it appears on the lock screen and handles unlocking.
 *
 * Showing a notification is NOT a visit. Only tapping it opens /n/{slug}, where
 * the existing redirect records the NFC tap.
 */

import { nfcUrl } from "@/lib/smartlink";

export const NFC_NOTIFICATION_CHANNEL = "TapLocal NFC";

export type NotificationCapability =
  | "native" // Android wrapper present — real notification channel
  | "supported" // web notifications available via the service worker
  | "permission_required" // available, but the user hasn't allowed notifications yet
  | "blocked" // the user denied notifications for this site
  | "unsupported"; // browser-only mode with no notification support at all

export const CAPABILITY_LABEL: Record<NotificationCapability, string> = {
  native: "Lock-screen notification supported",
  supported: "Lock-screen notification supported",
  permission_required: "Notification permission required",
  blocked: "Notifications blocked in your browser settings",
  unsupported: "Browser-only mode — native notification unavailable",
};

type NativeBridge = {
  showNfcNotification?: (payload: {
    channel: string;
    title: string;
    body: string;
    url: string;
    slug: string;
    businessName?: string | null;
  }) => void | Promise<void>;
};

function native(): NativeBridge["showNfcNotification"] | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { TapLocalNative?: NativeBridge }).TapLocalNative;
  return typeof bridge?.showNfcNotification === "function" ? bridge.showNfcNotification.bind(bridge) : null;
}

export function detectNotificationCapability(): NotificationCapability {
  if (typeof window === "undefined") return "unsupported";
  if (native()) return "native";
  const hasApi = "Notification" in window && "serviceWorker" in navigator;
  if (!hasApi || !window.isSecureContext) return "unsupported";
  const permission = Notification.permission;
  if (permission === "granted") return "supported";
  if (permission === "denied") return "blocked";
  return "permission_required";
}

/** Only ever called straight from an obvious user action (a button press). */
export async function requestNotificationPermission(): Promise<NotificationCapability> {
  if (typeof window === "undefined") return "unsupported";
  if (native()) return "native";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  try {
    const result = await Notification.requestPermission();
    return result === "granted" ? "supported" : result === "denied" ? "blocked" : "permission_required";
  } catch {
    return "unsupported";
  }
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
  } catch {
    return null;
  }
}

export type NfcNotificationInput = {
  slug: string;
  businessName?: string | null;
  test?: boolean;
};

export type NfcNotificationResult = { ok: true; via: "native" | "web" } | { ok: false; capability: NotificationCapability };

/**
 * Shows the standard TapLocal NFC notification for one tag.
 * Falls back honestly: when it can't show one, it says so instead of pretending.
 */
export async function showNfcNotification(input: NfcNotificationInput): Promise<NfcNotificationResult> {
  const url = nfcUrl(input.slug);
  const title = "TapLocal";
  const body = input.businessName ? `Tap to open ${input.businessName}` : "Tap to open this business";

  const bridge = native();
  if (bridge) {
    await bridge({
      channel: NFC_NOTIFICATION_CHANNEL,
      title,
      body,
      url,
      slug: input.slug,
      businessName: input.businessName ?? null,
    });
    return { ok: true, via: "native" };
  }

  const capability = detectNotificationCapability();
  if (capability !== "supported") return { ok: false, capability };

  const registration = await ensureServiceWorker();
  if (!registration) return { ok: false, capability: "unsupported" };

  await registration.showNotification(title, {
    body,
    tag: `taplocal-nfc-${input.slug}`,
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    requireInteraction: false,
    data: { url, slug: input.slug, test: input.test === true },
  });
  return { ok: true, via: "web" };
}
