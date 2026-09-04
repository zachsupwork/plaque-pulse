import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import {
  Button,
  Chip,
  CopyButton,
  EmbeddedNotice,
  Label,
  NfcWaves,
  QrImage,
  Row,
  SmartlinkStatusPanel,
  TestSmartlinkButton,
  useNfcSupport,
  useSmartlinkHealth,
} from "@/components/taplocal/NfcKit";
import { useBusinessId } from "@/hooks/usePortal";
import { useNfcSession } from "@/hooks/useNfcSession";
import { deviceInfo, nfcErrorMessage, nfcSession, readOnce, writeUrl } from "@/lib/nfc-client";
import { nfcUrl, qrUrl, smartlinkEnvironmentLabel } from "@/lib/smartlink";
import { listBusinessTags, recordTagVerification, recordTagWrite } from "@/lib/business-nfc.functions";
import { cn } from "@/lib/utils";


export type BusinessTag = {
  plaque: {
    id: string;
    plaque_code: string;
    public_slug: string;
    plaque_name: string | null;
    placement_type: string | null;
    product_type: string;
    status: string;
    location_id: string | null;
  };
  writeStatus: string;
  verificationStatus: string;
  destination: { destination_type: string; url: string } | null;
};

export type BusinessLocation = { id: string; name: string; city: string | null; active: boolean };

/** Every NFC tag this business owns, plus its locations. */
export function useBusinessTags() {
  const { data: businessId } = useBusinessId();
  const list = useServerFn(listBusinessTags);
  const query = useQuery({
    queryKey: ["business-nfc-tags", businessId],
    enabled: Boolean(businessId),
    queryFn: () => list({ data: { businessId: businessId! } }),
  });
  return {
    businessId,
    refetch: query.refetch,
    isLoading: query.isLoading,
    tags: (query.data?.ok ? (query.data.tags as unknown as BusinessTag[]) : []) ?? [],
    locations: (query.data?.ok ? (query.data.locations as BusinessLocation[]) : []) ?? [],
  };
}

export function tagLabel(tag: BusinessTag) {
  return tag.plaque.plaque_name || tag.plaque.plaque_code;
}

export function StatusChip({ tag }: { tag: BusinessTag }) {
  if (tag.verificationStatus === "verified") return <Chip tone="ok">Working</Chip>;
  if (tag.verificationStatus === "mismatch") return <Chip tone="bad">Wrong link</Chip>;
  if (tag.writeStatus === "programmed") return <Chip tone="warn">Not checked yet</Chip>;
  if (tag.writeStatus === "failed") return <Chip tone="bad">Failed</Chip>;
  return <Chip tone="idle">Not set up</Chip>;
}

/** Plain-language device readiness for business owners. */
export function DeviceStatus() {
  const support = useNfcSupport();
  const browser = useMemo(() => {
    if (typeof navigator === "undefined") return "…";
    const ua = navigator.userAgent;
    if (/EdgA?\//.test(ua)) return "Edge";
    if (/CriOS|Chrome\//.test(ua)) return "Chrome";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Safari\//.test(ua)) return "Safari";
    return "Other";
  }, []);

  return (
    <GlassPanel className="p-4">
      <Label>NFC device status</Label>
      <div className="mt-2">
        <Row
          label="NFC writing"
          value={support === null ? "Checking…" : support.usable ? <Chip tone="ok">Available ✓</Chip> : <Chip tone="idle">Not available</Chip>}
        />
        <Row
          label="NFC reading"
          value={support === null ? "Checking…" : support.usable ? <Chip tone="ok">Available ✓</Chip> : <Chip tone="idle">Not available</Chip>}
        />
        <Row label="Device" value={support?.device ?? "…"} />
        <Row label="Browser" value={browser} />
      </div>
      {support && !support.usable ? (
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          You can still manage your links and plaques here. Programming a tag from this screen needs a compatible
          NFC-writing device — an Android phone with Chrome. On other devices, use any NFC writing app with the link we
          show you.
        </p>
      ) : null}
    </GlassPanel>
  );
}

type Phase = "idle" | "waiting" | "writing" | "written" | "verifying" | "verified" | "mismatch" | "error";

/**
 * Owner-side write → read back → confirm for one tag.
 * Only ever writes the permanent TapLocal SmartLink, so the tag never needs rewriting
 * when the owner changes where it points.
 */
export function TagProgrammer({
  businessId,
  tag,
  onDone,
  verifyOnly = false,
}: {
  businessId: string;
  tag: BusinessTag;
  onDone?: () => void;
  verifyOnly?: boolean;
}) {
  const support = useNfcSupport();
  const write = useServerFn(recordTagWrite);
  const verify = useServerFn(recordTagVerification);

  const expected = useMemo(() => nfcUrl(tag.plaque.public_slug), [tag.plaque.public_slug]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const [manualDone, setManualDone] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    setPhase("idle");
    setMessage(null);
    setFound(null);
    setManualDone(false);
  }, [tag.plaque.id]);

  async function handleWrite() {
    setMessage(null);
    setFound(null);
    setPhase("waiting");
    await write({ data: { businessId, plaqueId: tag.plaque.id, status: "programming", deviceInfo: deviceInfo() } });
    try {
      setPhase("writing");
      await writeUrl(expected);
      await write({ data: { businessId, plaqueId: tag.plaque.id, status: "programmed", deviceInfo: deviceInfo() } });
      setPhase("written");
    } catch (error) {
      await write({ data: { businessId, plaqueId: tag.plaque.id, status: "failed", deviceInfo: deviceInfo() } });
      setMessage(nfcErrorMessage(error));
      setPhase("error");
    }
  }

  async function handleVerify() {
    setMessage(null);
    setPhase("verifying");
    try {
      const result = await readOnce();
      const actual = result.url ?? result.records[0]?.value ?? "";
      setFound(actual || "(empty tag)");
      const outcome = await verify({ data: { businessId, plaqueId: tag.plaque.id, actualUrl: actual, deviceInfo: deviceInfo() } });
      if (outcome.ok && outcome.matched) {
        setPhase("verified");
        onDone?.();
      } else {
        setPhase("mismatch");
      }
    } catch (error) {
      setMessage(nfcErrorMessage(error));
      setPhase("error");
    }
  }

  async function confirmManual() {
    await write({
      data: {
        businessId,
        plaqueId: tag.plaque.id,
        status: "programmed",
        manual: true,
        notes: "Programmed by the owner with an outside NFC app",
        deviceInfo: deviceInfo(),
      },
    });
    setManualDone(true);
    onDone?.();
  }

  return (
    <div className="space-y-4">
      <GlassPanel className="p-5" sheen>
        <Label>{verifyOnly ? "Checking" : "Setting up"}</Label>
        <p className="font-display mt-1 text-[22px] font-bold tracking-tight">{tagLabel(tag)}</p>
        <p className="mt-4 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Tag link</p>
        <p className="mt-1 font-mono text-[14px] break-all text-accent">{expected}</p>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          This permanent link stays on the tag forever. Change where it sends people any time in TapLocal — you never
          have to touch the tag again.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <CopyButton value={expected} label="Copy tag link" />
          <Button variant="ghost" onClick={() => window.open(testUrl(expected), "_blank", "noopener")}>
            Test it
          </Button>
          {support?.usable && !verifyOnly ? (
            <Button onClick={handleWrite} disabled={phase === "waiting" || phase === "writing" || phase === "verifying"}>
              Program tag
            </Button>
          ) : null}
          {support?.usable ? (
            <Button variant="ghost" onClick={handleVerify} disabled={phase === "verifying"}>
              Check tag
            </Button>
          ) : null}
        </div>
      </GlassPanel>

      {phase !== "idle" ? (
        <GlassPanel className="p-5">
          {phase === "waiting" || phase === "writing" ? (
            <div className="flex items-center gap-4">
              <NfcWaves />
              <div>
                <p className="text-[15px] font-bold">{phase === "waiting" ? "Hold the tag to your phone…" : "Programming…"}</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Keep it flat against the back or top of the phone until you see the green confirmation.
                </p>
              </div>
            </div>
          ) : null}

          {phase === "written" ? (
            <div>
              <Chip tone="warn">Programmed — not checked yet</Chip>
              <p className="mt-2 text-[13px] text-muted-foreground">
                Now hold the same tag to your phone once more so we can confirm it really works.
              </p>
              <Button className="mt-3" onClick={handleVerify}>
                Check the tag
              </Button>
            </div>
          ) : null}

          {phase === "verifying" ? (
            <div className="flex items-center gap-4">
              <NfcWaves />
              <p className="text-[15px] font-bold">Checking… hold the tag to your phone</p>
            </div>
          ) : null}

          {phase === "verified" ? (
            <div>
              <p className="text-[20px] font-bold text-accent">✓ This tag works</p>
              <div className="mt-3">
                <Row label="Should say" value={<span className="font-mono">{expected}</span>} />
                <Row label="Tag says" value={<span className="font-mono">{found}</span>} />
              </div>
            </div>
          ) : null}

          {phase === "mismatch" ? (
            <div>
              <p className="text-[16px] font-bold text-destructive">This tag holds a different link</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                It won&apos;t send customers where you expect. Program it again to fix it.
              </p>
              <div className="mt-3">
                <Row label="Should say" value={<span className="font-mono">{expected}</span>} />
                <Row label="Tag says" value={<span className="font-mono">{found}</span>} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {support?.usable ? <Button onClick={handleWrite}>Program again</Button> : null}
                <Button variant="ghost" onClick={handleVerify}>
                  Check again
                </Button>
              </div>
            </div>
          ) : null}

          {phase === "error" ? (
            <div>
              <p className="text-[15px] font-bold text-destructive">That didn&apos;t work</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {support?.usable && !verifyOnly ? <Button onClick={handleWrite}>Try again</Button> : null}
                <Button variant="ghost" onClick={() => setPhase("idle")}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </GlassPanel>
      ) : null}

      {support && !support.usable ? (
        <GlassPanel className="p-5">
          <p className="text-[15px] font-bold">This device can&apos;t program tags</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Use any NFC writing app on an Android phone and write exactly the link below, or print the QR code instead.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton value={expected} label="Copy tag link" />
            <Button variant="ghost" onClick={() => setShowQr((v) => !v)}>
              {showQr ? "Hide QR code" : "Show QR code"}
            </Button>
          </div>
          {showQr ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <QrImage value={qrUrl(tag.plaque.public_slug)} />
              <p className="font-mono text-[12px] break-all text-muted-foreground">{qrUrl(tag.plaque.public_slug)}</p>
            </div>
          ) : null}
          <div className={cn("mt-4 rounded-xl border border-border bg-foreground/5 p-3.5")}>
            {manualDone ? (
              <Chip tone="warn">Marked as programmed — not checked</Chip>
            ) : (
              <Button variant="ghost" onClick={confirmManual}>
                I programmed this tag myself
              </Button>
            )}
          </div>
        </GlassPanel>
      ) : null}
    </div>
  );
}
