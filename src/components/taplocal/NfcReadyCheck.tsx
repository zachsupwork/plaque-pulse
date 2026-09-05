import { useEffect, useRef, useState } from "react";
import { Nfc, Check, AlertTriangle, Loader2 } from "lucide-react";
import { detectSupport, isEmbedded, nfcSession } from "@/lib/nfc-client";
import { parseSmartLink } from "@/lib/smartlink";

type CheckState =
  | "checking"
  | "ready"
  | "waiting"
  | "detected"
  | "wrong_plaque"
  | "turn_on"
  | "unavailable";

const COPY: Record<CheckState, string> = {
  checking: "Checking device",
  ready: "NFC ready",
  waiting: "Waiting for plaque",
  detected: "Plaque detected",
  wrong_plaque: "Wrong plaque",
  turn_on: "Turn NFC on",
  unavailable: "NFC check not available in this browser",
};

/**
 * Optional reassurance step: proves the tag and the phone talk to each other.
 * It never blocks setup — a phone without NFC simply skips it.
 */
export function NfcReadyCheck({
  expectedSlug,
  onDetected,
}: {
  expectedSlug?: string;
  onDetected?: (slug: string) => void;
}) {
  const [state, setState] = useState<CheckState>("checking");
  const [detail, setDetail] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const support = detectSupport();
    setState(support.usable && !isEmbedded() ? "ready" : "unavailable");
    return () => {
      mounted.current = false;
      nfcSession.stop();
    };
  }, []);

  async function startCheck() {
    setDetail(null);
    setState("waiting");
    try {
      const result = await nfcSession.read(20000);
      if (!mounted.current) return;
      const parsed = result.url ? parseSmartLink(result.url) : null;

      if (expectedSlug && parsed && parsed.slug !== expectedSlug) {
        setState("wrong_plaque");
        setDetail("That's a different plaque. Tap the one you're setting up.");
        return;
      }

      setState("detected");
      if (parsed?.slug) onDetected?.(parsed.slug);
    } catch (error) {
      if (!mounted.current) return;
      const name = (error as Error)?.name;
      if (name === "NotAllowedError" || name === "NotReadableError") {
        setState("turn_on");
        setDetail("Switch NFC on in your phone settings, then try again.");
        return;
      }
      if (name === "AbortError") {
        setState("ready");
        return;
      }
      setState("ready");
      setDetail("We didn't pick anything up. Hold the plaque flat against the back of your phone.");
    }
  }

  const done = state === "detected";
  const problem = state === "wrong_plaque" || state === "turn_on";

  return (
    <div className="rounded-xl border border-border bg-foreground/5 p-3.5">
      <div className="flex items-center gap-2.5">
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg ${
            done
              ? "bg-accent/20 text-accent"
              : problem
                ? "bg-destructive/15 text-destructive"
                : "bg-primary/15 text-primary"
          }`}
        >
          {state === "checking" || state === "waiting" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : done ? (
            <Check className="h-4 w-4" />
          ) : problem ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <Nfc className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">
            {COPY[state]}
            {done ? " ✓" : ""}
          </p>
          <p className="text-[12px] leading-snug text-muted-foreground text-pretty">
            {detail ??
              (state === "unavailable"
                ? "You can still finish setup — this check just needs an Android phone."
                : state === "waiting"
                  ? "Hold the plaque against the back of your phone."
                  : "Optional: tap your plaque to check it's working.")}
          </p>
        </div>
      </div>

      {state !== "unavailable" && !done ? (
        <div className="mt-3 flex gap-2">
          {state === "waiting" ? (
            <button
              type="button"
              onClick={() => {
                nfcSession.cancel();
                setState("ready");
              }}
              className="rounded-lg border border-border px-3 py-2 text-[12px] font-semibold text-muted-foreground"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={startCheck}
              className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-[12px] font-semibold text-primary"
            >
              Check my plaque
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
