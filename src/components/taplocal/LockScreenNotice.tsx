import { useEffect, useState } from "react";
import { GlassPanel, StatusChip } from "@/components/taplocal/Field";
import {
  CAPABILITY_LABEL,
  detectNotificationCapability,
  requestNotificationPermission,
  showNfcNotification,
  type NotificationCapability,
} from "@/lib/nfc-notification";
import { platform } from "@/lib/nfc-readiness";

/**
 * Admin/testing surface for the Android lock-screen notification path.
 * Purely additive: it never touches the tag, the programming flow or the SmartLink.
 */
export function LockScreenNotice({
  slug,
  businessName,
  compact,
}: {
  slug: string;
  businessName?: string | null;
  compact?: boolean;
}) {
  const [capability, setCapability] = useState<NotificationCapability>("unsupported");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [android, setAndroid] = useState(false);

  useEffect(() => {
    setCapability(detectNotificationCapability());
    setAndroid(platform() === "android");
  }, []);

  const tone =
    capability === "native" || capability === "supported"
      ? "ok"
      : capability === "unsupported" || capability === "blocked"
        ? "problem"
        : "attention";

  async function test() {
    setBusy(true);
    setNote(null);
    try {
      let current = capability;
      if (current === "permission_required") {
        current = await requestNotificationPermission();
        setCapability(current);
      }
      if (current !== "supported" && current !== "native") {
        setNote(CAPABILITY_LABEL[current]);
        return;
      }
      const result = await showNfcNotification({ slug, businessName, test: true });
      setNote(
        result.ok
          ? "Test notification sent. Where your phone's settings allow it, it appears on the lock screen — opening it counts as a tap, showing it does not."
          : CAPABILITY_LABEL[result.capability],
      );
      setCapability(detectNotificationCapability());
    } catch {
      setNote("The phone would not show a notification. Nothing about the plaque was changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassPanel className={compact ? "space-y-2 p-3.5" : "space-y-3 p-4"}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-bold">Lock-screen notification</p>
        <StatusChip tone={tone}>{CAPABILITY_LABEL[capability]}</StatusChip>
      </div>

      <p className="text-[12px] leading-relaxed text-muted-foreground">
        {capability === "unsupported"
          ? "This phone or browser can't show a TapLocal notification. Taps still work normally — the tag opens the business link directly."
          : android
            ? "Android decides whether the notification shows on the lock screen and asks for the usual unlock. Opening it goes to the plaque's TapLocal link, so the tap is counted once."
            : "Notifications work here, though the lock-screen behaviour is Android-specific."}
      </p>

      <button
        type="button"
        onClick={test}
        disabled={busy || capability === "unsupported"}
        className="w-full rounded-xl border border-border bg-foreground/5 px-4 py-2.5 text-[13px] font-bold disabled:opacity-50"
      >
        {busy ? "Sending…" : "Test lock-screen notification"}
      </button>

      {note ? <p className="text-[12px] text-muted-foreground">{note}</p> : null}
    </GlassPanel>
  );
}
