import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/taplocal/Field";
import {
  detectSupport,
  deviceInfo,
  isEmbedded,
  nfcErrorMessage,
  nfcSession,
  readOnce,
  writeUrl,
  type NfcSupport,
} from "@/lib/nfc-client";
import { useNfcSession } from "@/hooks/useNfcSession";
import { NfcReadyPanel, NfcStatusChip, useNfcReadiness, useNfcTools } from "@/components/taplocal/NfcReady";
import { nfcUrl, qrUrl, smartlinkEnvironmentLabel, testUrl } from "@/lib/smartlink";
import { checkSmartlink } from "@/lib/smartlink.functions";
import { logProgrammingEvent, setVerification, setWriteStatus } from "@/lib/nfc.functions";


export type ProgrammablePlaque = {
  id: string;
  plaque_code: string;
  public_slug: string;
  product_type: string;
  status: string;
  batch_id: string | null;
  business_id: string | null;
};

export function useNfcSupport() {
  const [support, setSupport] = useState<NfcSupport | null>(null);
  useEffect(() => setSupport(detectSupport()), []);
  return support;
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{children}</p>;
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-right text-[13px] font-semibold break-all">{value}</span>
    </div>
  );
}

export function Chip({ tone, children }: { tone: "ok" | "warn" | "bad" | "idle"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-bold",
        tone === "ok" && "border-accent/30 bg-accent/15 text-accent",
        tone === "warn" && "border-primary/30 bg-primary/15 text-primary",
        tone === "bad" && "border-destructive/30 bg-destructive/15 text-destructive",
        tone === "idle" && "border-border bg-foreground/5 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "solid",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: (() => void) | undefined;
  variant?: "solid" | "ghost" | "danger" | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-xl px-4 py-3 text-[13px] font-bold transition disabled:opacity-40",
        variant === "solid" && "bg-primary text-primary-foreground",
        variant === "ghost" && "border border-border bg-foreground/5 text-foreground",
        variant === "danger" && "border border-destructive/40 bg-destructive/15 text-destructive",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CopyButton({ value, label = "Copy URL" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* clipboard blocked — the URL is shown on screen as a fallback */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? "Copied ✓" : label}
    </Button>
  );
}

export function QrImage({ value, size = 180 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: "#0a0e1a", light: "#ffffff" } }).then((d) => {
      if (alive) setSrc(d);
    });
    return () => {
      alive = false;
    };
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size }} className="rounded-xl bg-foreground/10" />;
  return <img src={src} alt={`QR code for ${value}`} width={size} height={size} className="rounded-xl" />;
}

export function SupportStatus({ support }: { support: NfcSupport | null }) {
  return (
    <GlassPanel className="p-4">
      <Label>NFC support status</Label>
      <div className="mt-2">
        <Row
          label="Browser NFC"
          value={
            support === null ? (
              "Checking…"
            ) : support.hasApi ? (
              <Chip tone="ok">Supported</Chip>
            ) : (
              <Chip tone="bad">Not supported</Chip>
            )
          }
        />
        <Row
          label="Secure connection"
          value={support?.secureContext ? <Chip tone="ok">HTTPS ✓</Chip> : <Chip tone="bad">Insecure</Chip>}
        />
        <Row label="Device" value={support?.device ?? "…"} />
        <Row
          label="Web NFC API"
          value={support?.usable ? <Chip tone="ok">Available</Chip> : <Chip tone="idle">Unavailable</Chip>}
        />
      </div>
      {support && !support.usable ? (
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          Tag writing needs Chrome on Android over HTTPS. On iPhone, desktop, or other browsers use the manual
          fallback below — a native TapLocal NFC utility is planned for those devices.
        </p>
      ) : null}
    </GlassPanel>
  );
}

type Phase = "idle" | "waiting" | "writing" | "written" | "verifying" | "verified" | "mismatch" | "error";

/**
 * The full write → read-back → verify machine for one plaque.
 * Only ever writes the permanent SmartLink; never the live destination.
 */
export function ProgramPanel({
  plaque,
  onVerified,
  preprogrammed,
  onContinue,
  continueLabel,
}: {
  plaque: ProgrammablePlaque;
  onVerified?: (() => void) | undefined;
  /** The tag already carries the right SmartLink — no writing required. */
  preprogrammed?: boolean | undefined;
  /** Lets the operator move on when this device can't (or needn't) write. */
  onContinue?: (() => void) | undefined;
  continueLabel?: string | undefined;
}) {
  const support = useNfcSupport();
  const session = useNfcSession();
  const write = useServerFn(setWriteStatus);
  const verify = useServerFn(setVerification);
  const log = useServerFn(logProgrammingEvent);

  const expected = useMemo(() => nfcUrl(plaque.public_slug), [plaque.public_slug]);
  const health = useSmartlinkHealth(plaque.public_slug);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const [manualChecked, setManualChecked] = useState(false);
  const [manualDone, setManualDone] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [largeUrl, setLargeUrl] = useState(false);
  const [showReady, setShowReady] = useState(false);
  const { ready: nfcReady } = useNfcReadiness();
  const { enabled: toolsEnabled } = useNfcTools();


  useEffect(() => {
    nfcSession.stop();
    setPhase("idle");
    setMessage(null);
    setFound(null);
    setManualChecked(false);
    setManualDone(false);
  }, [plaque.id]);

  const blocked = health.data ? !health.data.redirectReady : false;

  async function handleWrite() {
    if (session.busy) nfcSession.stop();
    if (blocked) return;
    setMessage(null);
    setFound(null);
    setPhase("waiting");
    await log({
      data: { plaqueId: plaque.id, eventType: "write_started", expectedValue: expected, deviceInfo: deviceInfo() },
    });
    await write({ data: { plaqueId: plaque.id, status: "programming", deviceInfo: deviceInfo() } });
    try {
      setPhase("writing");
      await writeUrl(expected);
      await write({ data: { plaqueId: plaque.id, status: "programmed", deviceInfo: deviceInfo() } });
      await log({
        data: { plaqueId: plaque.id, eventType: "write_success", expectedValue: expected, result: "written", deviceInfo: deviceInfo() },
      });
      setPhase("written");
    } catch (error) {
      await write({ data: { plaqueId: plaque.id, status: "failed", deviceInfo: deviceInfo() } });
      await log({
        data: { plaqueId: plaque.id, eventType: "write_failed", expectedValue: expected, result: (error as Error).name ?? "error", deviceInfo: deviceInfo() },
      });
      setMessage(nfcErrorMessage(error));
      setPhase("error");
    }
  }

  async function handleVerify() {
    if (session.busy) nfcSession.stop();
    setMessage(null);
    setPhase("verifying");
    try {
      const result = await readOnce();
      const actual = result.url ?? result.records[0]?.value ?? "";
      setFound(actual || "(empty tag)");
      await log({
        data: { plaqueId: plaque.id, eventType: "read_success", expectedValue: expected, actualValue: actual, deviceInfo: deviceInfo() },
      });
      const outcome = await verify({ data: { plaqueId: plaque.id, actualUrl: actual, deviceInfo: deviceInfo() } });
      if (outcome.ok && outcome.matched) {
        setPhase("verified");
        onVerified?.();
      } else {
        setPhase("mismatch");
      }
    } catch (error) {
      setMessage(nfcErrorMessage(error));
      setPhase("error");
    }
  }

  function handleCancel() {
    nfcSession.cancel();
    setPhase("idle");
    setMessage(null);
  }

  async function confirmManual() {
    await write({
      data: {
        plaqueId: plaque.id,
        status: "programmed",
        manual: true,
        notes: "Programmed manually with an external NFC tool",
        deviceInfo: deviceInfo(),
      },
    });
    setManualDone(true);
  }

  return (
    <div className="space-y-4">
      <EmbeddedNotice />
      <NfcStatusChip />
      <GlassPanel className="p-5" sheen>
        <Label>Plaque</Label>
        <p className="font-display mt-1 text-[24px] font-bold tracking-tight">{plaque.plaque_code}</p>
        <p className="mt-4 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Write this URL</p>
        <p className={cn("mt-1 font-mono break-all text-accent", largeUrl ? "text-[20px] leading-snug" : "text-[14px]")}>
          {expected}
        </p>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          The tag always carries this permanent SmartLink. When the business changes where it points, the tag stays
          untouched.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <CopyButton value={expected} />
          <TestSmartlinkButton slug={plaque.public_slug} />
          {session.busy ? (
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </GlassPanel>

      {/* Always present, whatever the device can or can't do. */}
      <NfcActionArea
        plaqueCode={plaque.plaque_code}
        smartlink={expected}
        qrValue={qrUrl(plaque.public_slug)}
        handoffUrl={handoff}
        preprogrammed={preprogrammed}
        busy={session.busy}
        onProgram={blocked ? undefined : handleWrite}
        onContinue={onContinue}
        continueLabel={continueLabel}
      />


      <SmartlinkStatusPanel slug={plaque.public_slug} />



      {phase !== "idle" ? (
        <GlassPanel className="p-5">
          {phase === "waiting" || phase === "writing" ? (
            <div className="flex items-center gap-4">
              <NfcWaves />
              <div>
                <p className="text-[15px] font-bold">
                  {phase === "waiting" ? "Waiting for tag…" : "Writing…"}
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Hold the NFC tag near the top or back of your phone until you see the confirmation.
                </p>
              </div>
            </div>
          ) : null}

          {phase === "written" ? (
            <div>
              <Chip tone="warn">Written — not verified yet</Chip>
              <p className="mt-2 text-[13px] text-muted-foreground">
                The write completed. Read the tag back to confirm it really holds the right SmartLink.
              </p>
              <Button className="mt-3" onClick={handleVerify}>
                Read back &amp; verify
              </Button>
            </div>
          ) : null}

          {phase === "verifying" ? (
            <div className="flex items-center gap-4">
              <NfcWaves />
              <p className="text-[15px] font-bold">Verifying… hold the same tag to your phone</p>
            </div>
          ) : null}

          {phase === "verified" ? (
            <div>
              <p className="text-[20px] font-bold text-accent">✓ NFC VERIFIED</p>
              <div className="mt-3">
                <Row label="Expected" value={<span className="font-mono">{expected}</span>} />
                <Row label="Read from tag" value={<span className="font-mono">{found}</span>} />
              </div>
              <p className="mt-3 text-[13px]">Plaque {plaque.plaque_code} is ready for assembly.</p>
            </div>
          ) : null}

          {phase === "mismatch" ? (
            <div>
              <p className="text-[16px] font-bold text-destructive">Warning — tag does not match</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                This NFC tag does not contain the expected TapLocal SmartLink.
              </p>
              <div className="mt-3">
                <Row label="Expected" value={<span className="font-mono">{expected}</span>} />
                <Row label="Found" value={<span className="font-mono">{found}</span>} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={handleWrite} disabled={session.busy || blocked}>
                  Rewrite tag
                </Button>
                <Button variant="ghost" onClick={handleVerify} disabled={session.busy}>
                  Read again
                </Button>
                <Button variant="ghost" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {phase === "error" ? (
            <div>
              <p className="text-[15px] font-bold text-destructive">✕ Failed</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={handleWrite} disabled={session.busy || blocked}>
                  Try again
                </Button>
                <Button variant="ghost" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

        </GlassPanel>
      ) : null}

      {support && !support.usable ? (
        <GlassPanel className="p-5">
          <p className="text-[15px] font-bold">NFC writing not available on this device</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Program the tag with any NFC writing app, using exactly the URL below.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton value={expected} label="Copy NFC URL" />
            <Button variant="ghost" onClick={() => setLargeUrl((v) => !v)}>
              {largeUrl ? "Normal size" : "Show large URL"}
            </Button>
            <Button variant="ghost" onClick={() => setShowQr((v) => !v)}>
              {showQr ? "Hide QR" : "Show QR"}
            </Button>
          </div>
          {showQr ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <QrImage value={qrUrl(plaque.public_slug)} />
              <p className="font-mono text-[12px] break-all text-muted-foreground">{qrUrl(plaque.public_slug)}</p>
            </div>
          ) : null}

          <div className="mt-4 rounded-xl border border-border bg-foreground/5 p-3.5">
            {manualDone ? (
              <Chip tone="warn">Programmed manually — unverified</Chip>
            ) : (
              <>
                <label className="flex items-start gap-2.5 text-[13px]">
                  <input
                    type="checkbox"
                    checked={manualChecked}
                    onChange={(e) => setManualChecked(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>I programmed the NFC tag with the exact SmartLink shown above.</span>
                </label>
                <Button className="mt-3" disabled={!manualChecked} onClick={confirmManual}>
                  Confirm
                </Button>
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Manual confirmation records the tag as programmed but never as verified.
                </p>
              </>
            )}
          </div>
        </GlassPanel>
      ) : null}
    </div>
  );
}

export function NfcWaves() {
  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center">
      <span className="absolute h-14 w-14 animate-ping rounded-full bg-primary/20" />
      <span className="absolute h-10 w-10 rounded-full bg-primary/25" />
      <span className="relative text-[18px]">📶</span>
    </div>
  );
}

/* ---------------- SmartLink readiness ---------------- */

/** Live health of one plaque's SmartLink: host, plaque, destination, redirect. */
export function useSmartlinkHealth(slug: string) {
  const check = useServerFn(checkSmartlink);
  return useQuery({
    queryKey: ["smartlink-health", slug],
    queryFn: () => check({ data: { slug } }),
    staleTime: 30_000,
  });
}

function CheckLine({ label, ok, pending }: { label: string; ok: boolean; pending: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={cn("text-[13px] font-bold", pending ? "text-muted-foreground" : ok ? "text-accent" : "text-destructive")}>
        {pending ? "Checking…" : ok ? "✓" : "✕"}
      </span>
    </div>
  );
}

export function SmartlinkStatusPanel({ slug }: { slug: string }) {
  const { data, isLoading, refetch, isFetching } = useSmartlinkHealth(slug);
  const pending = isLoading || !data;

  return (
    <GlassPanel className="p-4">
      <div className="flex items-center justify-between gap-3">
        <Label>SmartLink status</Label>
        <Chip tone={data?.production ? "ok" : "warn"}>{smartlinkEnvironmentLabel()}</Chip>
      </div>
      <div className="mt-2">
        <CheckLine label="Host reachable" ok={Boolean(data?.hostReachable)} pending={pending} />
        <CheckLine label="Tag exists" ok={Boolean(data?.plaqueExists)} pending={pending} />
        <CheckLine label="Destination configured" ok={Boolean(data?.destinationConfigured)} pending={pending} />
        <CheckLine label="Redirect ready" ok={Boolean(data?.redirectReady)} pending={pending} />
      </div>
      {data && !data.redirectReady ? (
        <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5">
          <p className="text-[13px] font-bold text-destructive">SMARTLINK NOT READY</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            TapLocal has not finished configuring this SmartLink. Fix the SmartLink before programming this NFC tag.
          </p>
          {data.problem ? <p className="mt-1 text-[12px] text-muted-foreground">{data.problem}</p> : null}
        </div>
      ) : null}
      <Button className="mt-3" variant="ghost" onClick={() => void refetch()} disabled={isFetching}>
        {isFetching ? "Checking…" : "Re-check SmartLink"}
      </Button>
    </GlassPanel>
  );
}

/** Validates the SmartLink before ever opening it, so nobody meets a dead URL. */
export function TestSmartlinkButton({ slug, label = "Test it" }: { slug: string; label?: string }) {
  const check = useServerFn(checkSmartlink);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setProblem(null);
          try {
            const result = await check({ data: { slug } });
            if (!result.redirectReady) {
              setProblem(result.problem ?? "This SmartLink isn't ready yet.");
              return;
            }
            window.open(testUrl(result.url), "_blank", "noopener");
          } catch {
            setProblem("We couldn't reach the SmartLink just now.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking…" : label}
      </Button>
      {problem ? <p className="basis-full text-[13px] font-semibold text-destructive">{problem}</p> : null}
    </>
  );
}

/** Web NFC permission cannot be granted inside the embedded preview frame. */
export function EmbeddedNotice() {
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => setEmbedded(isEmbedded()), []);
  if (!embedded) return null;
  return (
    <GlassPanel className="p-4">
      <p className="text-[14px] font-bold">For NFC programming, open TapLocal directly in your browser.</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        NFC hardware isn&apos;t available inside an embedded preview window. Open the app in Chrome on Android over
        HTTPS.
      </p>
      <Button
        className="mt-3"
        variant="ghost"
        onClick={() => window.open(window.location.href, "_blank", "noopener")}
      >
        Open Directly
      </Button>
    </GlassPanel>
  );
}
