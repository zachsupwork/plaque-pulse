import { useCallback, useEffect, useState } from "react";
import { GlassPanel } from "@/components/taplocal/Field";
import { Button, Chip, Label, Row } from "@/components/taplocal/NfcKit";
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
