import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, StatusChip } from "@/components/taplocal/Field";
import { checkTapTest, getPlaqueNfcStatus, setPlaqueEnabled, startTapTest } from "@/lib/tap-test.functions";
import { platform, type Platform } from "@/lib/nfc-readiness";
import { nfcUrl, qrUrl } from "@/lib/smartlink";

/**
 * The NFC plaque control for one SmartPlaque.
 *
 * Two things are deliberately kept apart:
 *  - the PHYSICAL tag, which carries a plain NDEF HTTPS record and is tapped by
 *    any modern iPhone or Android phone with no app and no permission prompt;
 *  - the TapLocal SMART LINK state, which is a database switch and therefore
 *    works from iPhone Safari, Android and desktop alike.
 *
 * Web NFC (writing/reading a chip from the browser) is a third, separate thing
 * that only some Android browsers expose. Its absence never means the phone's
 * NFC hardware is off.
 */
export function NfcPlaquePanel({ plaqueId, publicSlug }: { plaqueId: string; publicSlug: string }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getPlaqueNfcStatus);
  const enableFn = useServerFn(setPlaqueEnabled);
  const startFn = useServerFn(startTapTest);
  const checkFn = useServerFn(checkTapTest);

  const [device, setDevice] = useState<Platform>("other");
  const [webNfc, setWebNfc] = useState(false);
  useEffect(() => {
    setDevice(platform());
    setWebNfc(typeof window !== "undefined" && "NDEFReader" in window);
  }, []);

  const [note, setNote] = useState<string | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [expires, setExpires] = useState<number | null>(null);
  const [tap, setTap] = useState<{ occurredAt: string; source: string | null; device: string | null } | null>(null);
  const [tick, setTick] = useState(0);

  const status = useQuery({ queryKey: ["plaque-nfc", plaqueId], queryFn: () => statusFn({ data: { plaqueId } }) });
  const s = status.data?.ok ? status.data.status : null;

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => enableFn({ data: { plaqueId, enabled } }),
    onSuccess: (res) => {
      setNote(res.ok ? "Plaque updated." : "That change was rejected.");
      void qc.invalidateQueries({ queryKey: ["plaque-nfc", plaqueId] });
      void qc.invalidateQueries({ queryKey: ["admin-plaque", plaqueId] });
    },
  });

  // Tap test: poll for a visit recorded by the redirect while the window is open.
  useEffect(() => {
    if (!since) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      setTick((t) => t + 1);
      const res = await checkFn({ data: { plaqueId, since } });
      if (cancelled) return;
      if (res.ok && res.tap) {
        setTap(res.tap);
        setSince(null);
        void qc.invalidateQueries({ queryKey: ["plaque-nfc", plaqueId] });
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [since, plaqueId, checkFn, qc]);

  useEffect(() => {
    if (!since || !expires) return;
    if (Date.now() > expires) {
      setSince(null);
      setNote("No tap detected in that minute. Try again and hold the top of the phone against the plaque.");
    }
  }, [tick, since, expires]);

  const link = nfcUrl(publicSlug);
  const enabled = s?.enabled ?? true;
  const isIphone = device === "ios";

  const copy = (value: string, label: string) => {
    void navigator.clipboard?.writeText(value).then(
      () => setNote(`${label} copied.`),
      () => setNote("Could not copy — select the text instead."),
    );
  };

  return (
    <div>
      <SectionTitle>NFC plaque</SectionTitle>

      {note ? <p className="mb-2 rounded-xl border border-border bg-foreground/5 p-3 text-[13px]">{note}</p> : null}

      <GlassPanel className="space-y-4 p-4">
        {/* ---------- status block ---------- */}
        <div className="flex flex-wrap gap-1.5">
          <StatusChip tone={enabled ? "ok" : "problem"}>{enabled ? "🟢 Enabled" : "⚪ Disabled"}</StatusChip>
          <StatusChip tone={s?.destinationUrl ? "ok" : "attention"}>
            {s?.destinationUrl ? "Smart link active" : "No destination yet"}
          </StatusChip>
          <StatusChip tone={s?.verificationStatus === "verified" ? "ok" : "idle"}>
            {s?.verificationStatus === "verified" ? "Tag verified" : "Tag unverified"}
          </StatusChip>
        </div>

        <div className="space-y-2 text-[12px]">
          <Line label="Managed NFC URL" value={link} mono />
          <Line label="NFC destination" value={s?.destinationUrl ?? "Not set"} mono />
          <Line label="Google review destination" value={s?.googleReviewUrl ?? "Not connected"} mono />
          <Line
            label="Last verified tap"
            value={
              s?.lastTap
                ? `${new Date(s.lastTap.occurredAt).toLocaleString()} · ${s.lastTap.device ?? "Unknown device"}${
                    s.lastTap.source ? ` · ${s.lastTap.source.toUpperCase()}` : ""
                  }`
                : "No taps recorded yet"
            }
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Action onClick={() => copy(link, "NFC URL")}>Copy NFC URL</Action>
          <ActionLink href={`${link}?tl_test=1`}>Test destination</ActionLink>
          <ActionLink href={qrUrl(publicSlug)}>Show QR</ActionLink>
          <Action onClick={() => toggle.mutate(!enabled)} disabled={toggle.isPending}>
            {enabled ? "Disable plaque" : "Enable plaque"}
          </Action>
        </div>

        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Enabling or disabling is a TapLocal setting, not a phone setting — it works from an iPhone, an Android phone
          or a computer. When it's disabled, a tap still opens TapLocal and shows "This TapLocal plaque is currently
          inactive."
        </p>

        {/* ---------- platform-specific tools ---------- */}
        {webNfc ? (
          <div className="space-y-2 rounded-2xl border border-border p-3.5">
            <p className="text-[13px] font-bold">This phone can program tags</p>
            <p className="text-[12px] text-muted-foreground">
              Write the managed TapLocal link onto the chip, then read it back to confirm.
            </p>
            <Link
              to="/admin/plaques/$id/program"
              params={{ id: plaqueId }}
              className="flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 text-[13px] font-bold text-primary-foreground"
            >
              Scan / write / verify tag
            </Link>
          </div>
        ) : (
          <div className="space-y-2 rounded-2xl border border-border p-3.5">
            <p className="text-[13px] font-bold">
              {isIphone ? "✓ This iPhone can tap NFC plaques" : "✓ This device can manage the plaque"}
            </p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {isIphone
                ? "Your iPhone reads NFC tags automatically — hold the TOP of the phone near the plaque. Only browser-based tag writing is unavailable in Safari; the plaque itself, its link and everything on this page work normally."
                : "Writing a chip from the browser isn't available here. Everything else — destination, enable/disable, QR and tap history — works."}
            </p>
            <TapTest
              running={Boolean(since)}
              tap={tap}
              onStart={async () => {
                setTap(null);
                setNote(null);
                const res = await startFn({ data: { plaqueId } });
                if (res.ok && res.startedAt) {
                  setSince(res.startedAt);
                  setExpires(new Date(res.expiresAt!).getTime());
                }
              }}
            />
            {isIphone ? <IphoneTroubleshooting /> : null}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

function TapTest({
  running,
  tap,
  onStart,
}: {
  running: boolean;
  tap: { occurredAt: string; source: string | null; device: string | null } | null;
  onStart: () => void;
}) {
  return (
    <div className="mt-2">
      <Action onClick={onStart} disabled={running}>
        {running ? "Waiting for your tap…" : "Start tap test"}
      </Action>
      {running ? (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          Now tap this plaque with your iPhone: hold the top of the phone against the plaque with the screen on and
          unlocked, then open the notification. You have about a minute.
        </p>
      ) : null}
      {tap ? (
        <div className="mt-2 rounded-xl border border-accent/40 bg-accent/10 p-3">
          <p className="text-[13px] font-bold">✓ NFC tap detected</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {tap.device ?? "A phone"} reached the TapLocal link at {new Date(tap.occurredAt).toLocaleTimeString()}
            {tap.source ? ` via ${tap.source.toUpperCase()}` : ""}. This confirms the tap opened the expected TapLocal
            URL — it doesn't read what's stored in the chip's memory.
          </p>
        </div>
      ) : null}
    </div>
  );
}

const IPHONE_TIPS = [
  "Make sure the screen is on",
  "Unlock the iPhone",
  "Hold the TOP EDGE of the iPhone very close to the NFC symbol",
  "Move the phone slowly over the NFC area",
  "Remove very thick or metal cases if needed",
  "Make sure Airplane Mode is off",
  "Make sure Apple Pay or the camera isn't in use while testing",
];

function IphoneTroubleshooting() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <Action onClick={() => setOpen((v) => !v)}>{open ? "Hide tips" : "If the tap isn't detected"}</Action>
      {open ? (
        <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-muted-foreground">
          {IPHONE_TIPS.map((t) => (
            <li key={t}>• {t}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`break-all ${mono ? "font-mono text-[11px]" : "text-[12px]"}`}>{value}</p>
    </div>
  );
}

function Action({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-[44px] rounded-xl border border-border px-4 text-[12px] font-semibold disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-[44px] items-center rounded-xl border border-border px-4 text-[12px] font-semibold"
    >
      {children}
    </a>
  );
}
