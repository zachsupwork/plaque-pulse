import { useCallback, useEffect, useState } from "react";
import { GlassPanel } from "@/components/taplocal/Field";
import { Button, Chip, CopyButton, Label, QrImage, Row } from "@/components/taplocal/NfcKit";
import { nfcSession, nfcErrorMessage } from "@/lib/nfc-client";
import {
  baseReadiness,
  deviceName,
  markOnboardingSeen,
  nfcToolsEnabled,
  onboardingSeen,
  openNfcSettings,
  probeNfc,
  readNfcPermission,
  setNfcToolsEnabled,
  type NfcReadiness,
} from "@/lib/nfc-readiness";

/* --------------------------- readiness hook --------------------------- */

export function useNfcReadiness() {
  const [readiness, setReadiness] = useState<NfcReadiness | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<"ready" | "problem" | null>(null);

  const refresh = useCallback(async () => {
    const permission = await readNfcPermission();
    const next = baseReadiness(permission);
    setReadiness(next);
    if (next.state === "ready") setResult("ready");
    return next;
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  const check = useCallback(async () => {
    setChecking(true);
    setResult(null);
    try {
      const probe = await probeNfc();
      const permission = await readNfcPermission();
      const next = baseReadiness(permission);
      if (probe.ok) {
        setReadiness({ ...next, state: next.state === "unsupported" ? "unsupported" : "ready", detail: null });
        setResult("ready");
      } else {
        setReadiness({
          ...next,
          state: probe.reason === "unsupported" ? "unsupported" : "attention",
          detail:
            probe.reason === "permission"
              ? "TapLocal needs permission to use NFC on this phone."
              : probe.reason === "nfc_off"
                ? "NFC looks switched off on this phone."
                : next.detail,
        });
        setResult("problem");
      }
    } finally {
      nfcSession.stop();
      setChecking(false);
    }
  }, []);

  const ready = readiness?.state === "ready";
  const unsupported = readiness?.state === "unsupported";

  return { readiness, ready, unsupported, checking, result, check, refresh };
}

/* ------------------------------ status chip ---------------------------- */

export function NfcStatusChip({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { readiness, ready, unsupported, checking, check } = useNfcReadiness();
  const [open, setOpen] = useState(defaultOpen);

  const label = ready ? "NFC READY ✓" : unsupported ? "NFC NOT AVAILABLE HERE" : "NFC NEEDS ATTENTION";

  return (
    <div className="rounded-2xl border border-border bg-foreground/5 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3"
      >
        <Chip tone={ready ? "ok" : unsupported ? "idle" : "warn"}>{label}</Chip>
        <span className="text-[12px] font-semibold text-muted-foreground">{open ? "Hide" : "Details"}</span>
      </button>

      {open ? (
        <div className="mt-2">
          <Row label="Device" value={readiness ? deviceName() : "…"} />
          <Row label="Browser" value={readiness?.browser ?? "…"} />
          <Row
            label="Web NFC"
            value={readiness?.support.hasApi ? <Chip tone="ok">Supported</Chip> : <Chip tone="bad">Unsupported</Chip>}
          />
          <Row
            label="NFC permission"
            value={
              readiness?.permission === "granted"
                ? "Ready"
                : readiness?.permission === "denied"
                  ? "Blocked"
                  : readiness?.permission === "prompt"
                    ? "Needs permission"
                    : "Unknown"
            }
          />
          <Row
            label="Secure connection"
            value={readiness?.support.secureContext ? <Chip tone="ok">HTTPS ✓</Chip> : <Chip tone="bad">Insecure</Chip>}
          />
          {!unsupported ? (
            <Button className="mt-3" variant="ghost" onClick={() => void check()} disabled={checking}>
              {checking ? "Checking…" : "Check NFC"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------- full ready panel -------------------------- */

const ANDROID_STEPS = [
  "Open Settings",
  'Search for "NFC"',
  "Turn on NFC",
  "Return to TapLocal",
  "Tap Check again",
];

export function NfcReadyPanel({
  title = "Phone NFC",
  onReady,
  fallback,
}: {
  title?: string;
  onReady?: () => void;
  /** Extra actions shown when web programming can never work here. */
  fallback?: React.ReactNode;
}) {
  const { readiness, ready, unsupported, checking, result, check } = useNfcReadiness();
  const [settingsTried, setSettingsTried] = useState(false);
  const isAndroid = readiness?.support.device === "Android";

  return (
    <GlassPanel className="p-4">
      <div className="flex items-center justify-between gap-3">
        <Label>{title}</Label>
        <Chip tone={ready ? "ok" : unsupported ? "idle" : "warn"}>
          {ready ? "NFC ready ✓" : unsupported ? "Not available" : "Needs attention"}
        </Chip>
      </div>

      {unsupported ? (
        <>
          <p className="mt-2 text-[14px] font-bold">NFC web programming is not available on this device</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Use an Android phone with Chrome to program the tag, or use the manual NFC tool option below.
          </p>
          {fallback ? <div className="mt-3 flex flex-wrap gap-2">{fallback}</div> : null}
        </>
      ) : ready ? (
        <>
          <p className="mt-2 text-[14px] font-bold text-accent">NFC is ready ✓</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Your phone is ready to program TapLocal tags.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onReady ? <Button onClick={onReady}>Continue</Button> : null}
            <Button variant="ghost" onClick={() => void check()} disabled={checking}>
              {checking ? "Checking…" : "Check again"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-[14px] font-bold">
            {result === "problem" ? "NFC needs to be turned on" : "Check this phone before programming"}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {readiness?.detail ?? "Turn on NFC in your phone settings, then come back here."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void check()} disabled={checking}>
              {checking ? "Checking…" : result === "problem" ? "Check again" : "Check NFC"}
            </Button>
            {isAndroid ? (
              <Button
                variant="ghost"
                onClick={() => {
                  const tried = openNfcSettings();
                  setSettingsTried(true);
                  if (!tried) setSettingsTried(true);
                }}
              >
                Open NFC settings
              </Button>
            ) : null}
          </div>

          {isAndroid ? (
            <div className="mt-3 rounded-xl border border-border bg-foreground/5 p-3.5">
              <p className="text-[12px] font-bold">
                {settingsTried ? "If the settings screen didn't open:" : "On Android:"}
              </p>
              <ol className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-muted-foreground">
                {ANDROID_STEPS.map((step, i) => (
                  <li key={step}>
                    {i + 1}. {step}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Your phone's NFC switch is managed by Android — TapLocal can only check it and guide you there.
      </p>
    </GlassPanel>
  );
}

/* --------------------------- first-time card --------------------------- */

export function NfcOnboarding() {
  const [seen, setSeen] = useState(true);
  const { readiness, ready, unsupported, checking, check } = useNfcReadiness();

  useEffect(() => setSeen(onboardingSeen()), []);
  if (seen) return null;

  return (
    <GlassPanel className="p-4" sheen>
      <p className="font-display text-[17px] font-bold tracking-tight">Get this phone ready for NFC</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        TapLocal uses NFC to program and verify SmartPlaques.
      </p>

      {ready || unsupported ? (
        <ul className="mt-3 space-y-1 text-[13px]">
          <CheckItem ok={readiness?.browser === "Chrome" || Boolean(readiness?.support.hasApi)}>
            Chrome / compatible browser
          </CheckItem>
          <CheckItem ok={Boolean(readiness?.support.secureContext)}>Secure connection</CheckItem>
          <CheckItem ok={Boolean(readiness?.support.usable)}>NFC available</CheckItem>
          <CheckItem ok={ready}>Permission granted when required</CheckItem>
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {ready || unsupported ? (
          <Button
            onClick={() => {
              markOnboardingSeen();
              setSeen(true);
            }}
          >
            {ready ? "Ready to program" : "Got it"}
          </Button>
        ) : (
          <Button onClick={() => void check()} disabled={checking}>
            {checking ? "Checking…" : "Check my phone"}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            markOnboardingSeen();
            setSeen(true);
          }}
        >
          Skip
        </Button>
      </div>
    </GlassPanel>
  );
}

function CheckItem({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={ok ? "text-accent" : "text-muted-foreground"}>
      {ok ? "✓" : "•"} {children}
    </li>
  );
}

/* ------------------------ NFC tools preference ------------------------- */

export function useNfcTools() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const sync = () => setOn(nfcToolsEnabled());
    sync();
    window.addEventListener("taplocal-nfc-tools", sync);
    return () => window.removeEventListener("taplocal-nfc-tools", sync);
  }, []);
  return {
    enabled: on,
    setEnabled: (value: boolean) => {
      setNfcToolsEnabled(value);
      setOn(value);
    },
  };
}

export function NfcToolsSwitch() {
  const { enabled, setEnabled } = useNfcTools();
  return (
    <div className="mt-3 rounded-xl border border-border bg-foreground/5 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold">NFC programming tools</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            Controls TapLocal NFC tools on this device. Your phone's NFC setting is managed by Android.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEnabled(!enabled)}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-bold ${
            enabled ? "border-accent/40 bg-accent/15 text-accent" : "border-border bg-foreground/5 text-muted-foreground"
          }`}
        >
          {enabled ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------- test tag (read) --------------------------- */

export function TestNfcTagButton() {
  const [state, setState] = useState<"idle" | "waiting" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setState("waiting");
    setMessage(null);
    try {
      const result = await nfcSession.read(20000);
      setState("done");
      setMessage(result.url ?? result.records[0]?.value ?? "Tag read — no link stored on it.");
    } catch (error) {
      setState("error");
      setMessage(nfcErrorMessage(error));
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => void run()} disabled={state === "waiting"}>
          {state === "waiting" ? "Hold a tag to your phone…" : "Test NFC tag"}
        </Button>
        {state === "waiting" ? (
          <Button
            variant="ghost"
            onClick={() => {
              nfcSession.cancel();
              setState("idle");
            }}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      {message ? (
        <p className={`mt-2 font-mono text-[12px] break-all ${state === "error" ? "text-destructive" : "text-accent"}`}>
          {message}
        </p>
      ) : null}
      <p className="mt-1 text-[11px] text-muted-foreground">Reading only — this never changes what's on the tag.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Always-actionable NFC area.
 *
 * The rule: whatever the device state, the operator is given a next step.
 * Nothing here is a second NFC implementation — it reads the same
 * detectSupport()/readiness primitives and calls back into the existing
 * write/read flow through onProgram.
 * ------------------------------------------------------------------ */

export type NfcAreaStatus =
  | "ready"
  | "preprogrammed"
  | "manual_unverified"
  | "needs_on"
  | "needs_permission"
  | "ios"
  | "unsupported"
  | "embedded"
  | "checking";

const STATUS_LABEL: Record<NfcAreaStatus, string> = {
  ready: "NFC READY ✓",
  preprogrammed: "NFC PREPROGRAMMED ✓",
  manual_unverified: "PROGRAMMED MANUALLY — UNVERIFIED",
  needs_on: "NFC NEEDS TO BE TURNED ON",
  needs_permission: "NFC NEEDS PERMISSION",
  ios: "IPHONE DETECTED ✓ — SETUP READY",
  unsupported: "EXTERNAL NFC WRITER REQUIRED",
  embedded: "OPEN TAPLOCAL IN ITS OWN TAB",
  checking: "CHECKING THIS PHONE…",
};

const IPHONE_STEPS = [
  "Copy the TapLocal SmartLink below",
  "Open your NFC writing app",
  "Choose Write → URL",
  "Paste the TapLocal SmartLink",
  "Hold the top of your iPhone near the tag",
  "Come back to TapLocal and tap I've programmed it",
];


export function NfcActionArea({
  plaqueCode,
  smartlink,
  qrValue,
  handoffUrl,
  preprogrammed,
  manualProgrammed,
  busy,
  programLabel = "Program NFC",
  onProgram,
  onContinue,
  onManualProgrammed,
  continueLabel = "Continue without programming",
}: {
  plaqueCode?: string | undefined;
  smartlink?: string | undefined;
  qrValue?: string | undefined;
  /** Link a second (Android) phone — or the future TapLocal iOS app — can open to resume this exact plaque. */
  handoffUrl?: string | undefined;
  preprogrammed?: boolean | undefined;
  /** Written with an outside tool: counts as programmed, never as verified. */
  manualProgrammed?: boolean | undefined;
  busy?: boolean | undefined;
  programLabel?: string | undefined;
  onProgram?: (() => void) | undefined;
  onContinue?: (() => void) | undefined;
  onManualProgrammed?: (() => void) | undefined;
  continueLabel?: string | undefined;
}) {
  const { readiness, ready, unsupported, checking, result, check } = useNfcReadiness();
  const { enabled: toolsEnabled, setEnabled } = useNfcTools();
  const [showDetails, setShowDetails] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [largeUrl, setLargeUrl] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showHandoff, setShowHandoff] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [settingsTried, setSettingsTried] = useState(false);
  const [device, setDevice] = useState<Platform>("other");
  useEffect(() => setDevice(platform()), []);

  const isAndroid = device === "android";
  const isIphone = device === "ios";

  const status: NfcAreaStatus = !readiness
    ? "checking"
    : preprogrammed && !ready
      ? "preprogrammed"
      : manualProgrammed && !ready
        ? "manual_unverified"
        : readiness.state === "embedded"
          ? "embedded"
          : unsupported
            ? isIphone
              ? "ios"
              : "unsupported"
            : ready
              ? "ready"
              : readiness.permission === "denied"
                ? "needs_permission"
                : "needs_on";
  void result;

  const tone =
    status === "ready" || status === "preprogrammed" || status === "ios"
      ? "ok"
      : status === "checking"
        ? "idle"
        : "warn";

  /** Everything except writing a blank tag works on every phone. */
  const iphoneBlock = status === "ios" || status === "unsupported";

  return (
    <GlassPanel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="ok">SETUP READY ✓</Chip>
          <Chip tone={tone}>{STATUS_LABEL[status]}</Chip>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => void check()} disabled={checking || unsupported}>
            {checking ? "Checking…" : "Check again"}
          </Button>
          <Button variant="ghost" onClick={() => setShowDetails((v) => !v)}>
            {showDetails ? "Hide details" : "Details"}
          </Button>
        </div>
      </div>


      {/* ---------- ready ---------- */}
      {status === "ready" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {toolsEnabled ? (
            <Button onClick={onProgram} disabled={busy || !onProgram}>
              {busy ? "Waiting for tag…" : programLabel}
            </Button>
          ) : (
            <Button onClick={() => setEnabled(true)}>Turn TapLocal NFC tools on</Button>
          )}
          {onContinue ? (
            <Button variant="ghost" onClick={onContinue}>
              {continueLabel}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* ---------- preprogrammed ---------- */}
      {status === "preprogrammed" ? (
        <>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            This plaque already carries its permanent TapLocal link. No NFC programming is needed — you only need the
            business, destination and placement. That works on iPhone, Android and desktop.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onContinue ? <Button onClick={onContinue}>Continue setup</Button> : null}
            {onProgram ? (
              <Button variant="ghost" onClick={onProgram} disabled={busy}>
                Reprogram the tag anyway
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      {/* ---------- Android, but NFC not ready ---------- */}
      {status === "needs_on" || status === "needs_permission" || status === "embedded" ? (
        <>
          <p className="mt-2 text-[14px] font-bold">
            {status === "needs_permission"
              ? "TapLocal needs permission to use NFC"
              : status === "embedded"
                ? "Open TapLocal in its own browser tab"
                : "NFC needs to be turned on"}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {readiness?.detail ??
              "TapLocal needs NFC enabled on this phone to program the SmartPlaque. Everything else in this setup still works."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {isAndroid ? (
              <Button
                onClick={() => {
                  openNfcSettings();
                  setSettingsTried(true);
                }}
              >
                Turn on / open NFC settings
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => void check()} disabled={checking}>
              {checking ? "Checking…" : "Check again"}
            </Button>
            {onContinue ? (
              <Button variant="ghost" onClick={onContinue}>
                {continueLabel}
              </Button>
            ) : null}
          </div>
          <div className="mt-3 rounded-xl border border-border bg-foreground/5 p-3.5">
            <p className="text-[12px] font-bold">
              {settingsTried ? "If the settings screen didn't open:" : "Step by step:"}
            </p>
            <ol className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-muted-foreground">
              {ANDROID_STEPS.map((step, i) => (
                <li key={step}>
                  {i + 1}. {step}
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : null}

      {/* ---------- unsupported device ---------- */}
      {status === "unsupported" ? (
        <>
          <p className="mt-2 text-[14px] font-bold">NFC web programming is not available on this phone</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Your SmartPlaque setup can still be completed here. Writing a blank NFC tag needs a compatible Android
            phone with Chrome, or an NFC writing tool.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onContinue ? <Button onClick={onContinue}>Continue setup</Button> : null}
            {smartlink ? (
              <Button variant="ghost" onClick={() => setShowLink((v) => !v)}>
                {showLink ? "Hide SmartLink" : "Show SmartLink"}
              </Button>
            ) : null}
            {qrValue ? (
              <Button variant="ghost" onClick={() => setShowQr((v) => !v)}>
                {showQr ? "Hide QR" : "Show QR"}
              </Button>
            ) : null}
            {handoffUrl ? (
              <Button variant="ghost" onClick={() => setShowHandoff((v) => !v)}>
                {showHandoff ? "Hide handoff" : "Continue on another phone"}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setShowHelp((v) => !v)}>
              NFC help
            </Button>
          </div>
        </>
      ) : null}

      {showLink && smartlink ? (
        <div className="mt-3 rounded-xl border border-border bg-foreground/5 p-3.5">
          <Label>Permanent SmartLink</Label>
          <p className="mt-1 font-mono text-[13px] break-all text-accent">{smartlink}</p>
          <div className="mt-2">
            <CopyButton value={smartlink} label="Copy SmartLink" />
          </div>
        </div>
      ) : null}

      {showQr && qrValue ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-border bg-foreground/5 p-3.5">
          <QrImage value={qrValue} size={168} />
          <p className="font-mono text-[12px] break-all text-muted-foreground">{qrValue}</p>
        </div>
      ) : null}

      {showHandoff && handoffUrl ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-border bg-foreground/5 p-3.5">
          <p className="text-[13px] font-bold">Continue programming {plaqueCode ?? "this plaque"}</p>
          <QrImage value={handoffUrl} size={168} />
          <p className="text-center text-[12px] leading-relaxed text-muted-foreground">
            Scan this with an Android phone running Chrome. It opens the same plaque with the business, destination and
            placement already saved — nothing has to be re-entered. The second phone has to sign in as a TapLocal
            admin.
          </p>
          <CopyButton value={handoffUrl} label="Copy handoff link" />
        </div>
      ) : null}

      {showHelp ? (
        <div className="mt-3 rounded-xl border border-border bg-foreground/5 p-3.5 text-[12px] leading-relaxed text-muted-foreground">
          <p className="font-bold text-foreground">What needs NFC and what doesn't</p>
          <p className="mt-1">
            Setting the business, the customer destination, the placement, ownership and activity tracking never needs
            NFC — that is all handled by TapLocal and can be changed at any time from any device.
          </p>
          <p className="mt-1.5">
            Only writing the permanent link onto a blank or replacement tag needs an Android phone with Chrome, or a
            separate NFC writing tool.
          </p>
        </div>
      ) : null}

      {showDetails ? (
        <div className="mt-3">
          <Row label="Device" value={readiness ? deviceName() : "…"} />
          <Row label="Browser" value={readiness?.browser ?? "…"} />
          <Row
            label="Secure connection"
            value={readiness?.support.secureContext ? <Chip tone="ok">Yes</Chip> : <Chip tone="bad">No</Chip>}
          />
          <Row
            label="Web NFC API"
            value={readiness?.support.hasApi ? <Chip tone="ok">Available</Chip> : <Chip tone="idle">Not available</Chip>}
          />
          <Row
            label="Programming"
            value={
              status === "ready" ? (
                <Chip tone="ok">Ready</Chip>
              ) : status === "preprogrammed" ? (
                <Chip tone="ok">Not needed</Chip>
              ) : (
                <Chip tone="warn">Not ready</Chip>
              )
            }
          />
          {plaqueCode ? <Row label="Current plaque" value={plaqueCode} /> : null}
          {smartlink ? <Row label="SmartLink" value={<span className="font-mono">{smartlink}</span>} /> : null}
        </div>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Your phone's NFC switch is managed by Android — TapLocal can only check it and take you there.
      </p>
    </GlassPanel>
  );
}

/* ------------------------- admin header chip ------------------------- */

export function NfcHeaderChip({ onOpen }: { onOpen?: () => void }) {
  const { ready, unsupported } = useNfcReadiness();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="NFC readiness"
        onClick={() => {
          setOpen((v) => !v);
          onOpen?.();
        }}
        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
          ready
            ? "border-accent/40 bg-accent/15 text-accent"
            : unsupported
              ? "border-border bg-foreground/5 text-muted-foreground"
              : "border-primary/40 bg-primary/10 text-primary"
        }`}
      >
        {ready ? "NFC ✓" : "NFC !"}
      </button>
      {open ? (
        <div className="absolute top-full right-0 z-50 mt-2 w-[19rem]">
          <NfcActionArea />
        </div>
      ) : null}
    </>
  );
}
