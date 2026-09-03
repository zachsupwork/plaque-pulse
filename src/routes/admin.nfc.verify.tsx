import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GlassPanel } from "@/components/taplocal/Field";
import {
  Button,
  Chip,
  Label,
  NfcWaves,
  QrImage,
  Row,
  useNfcSupport,
  type ProgrammablePlaque,
} from "@/components/taplocal/NfcKit";
import { PlaquePicker } from "@/components/taplocal/PlaquePicker";
import { nfcErrorMessage, deviceInfo, readOnce } from "@/lib/nfc-client";
import { nfcUrl, qrUrl, testUrl } from "@/lib/smartlink";
import { getPlaqueProgramming, markAssemblyComplete, reportFaultyTag, setVerification } from "@/lib/nfc.functions";

const search = z.object({ code: z.string().optional() });

export const Route = createFileRoute("/admin/nfc/verify")({
  validateSearch: (input) => search.parse(input),
  head: () => ({
    meta: [
      { title: "Verify Plaque — TapLocal NFC Tools" },
      { name: "description", content: "Confirm a plaque's ID, NFC tag and QR code all point to the same SmartLink." },
      { property: "og:title", content: "Verify Plaque — TapLocal" },
      { property: "og:description", content: "Confirm plaque ID, NFC tag and QR code all match before shipping." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { code } = Route.useSearch();
  const lookup = useServerFn(getPlaqueProgramming);
  const verify = useServerFn(setVerification);
  const complete = useServerFn(markAssemblyComplete);
  const faulty = useServerFn(reportFaultyTag);
  const support = useNfcSupport();

  const [plaque, setPlaque] = useState<ProgrammablePlaque | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    void lookup({ data: { slug: code } }).then((r) => {
      if (r.ok && r.plaque) setPlaque(r.plaque as ProgrammablePlaque);
    });
  }, [code, lookup]);

  const verifyRun = useMutation({
    mutationFn: (actualUrl: string) =>
      verify({ data: { plaqueId: plaque!.id, actualUrl, deviceInfo: deviceInfo() } }),
  });
  const completeRun = useMutation({ mutationFn: () => complete({ data: { plaqueId: plaque!.id } }) });
  const faultyRun = useMutation({
    mutationFn: () => faulty({ data: { plaqueId: plaque!.id, notes: "Reported during verification" } }),
  });

  async function scan() {
    if (!plaque) return;
    setError(null);
    setScanning(true);
    try {
      const read = await readOnce();
      const url = read.url ?? "";
      setScanned(url);
      await verifyRun.mutateAsync(url);
    } catch (err) {
      setError(nfcErrorMessage(err));
    } finally {
      setScanning(false);
    }
  }

  if (!plaque) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-[24px] font-bold tracking-tight">Verify Plaque</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Pick the plaque you're holding, then scan its tag to confirm everything matches.
          </p>
        </div>
        <PlaquePicker onSelect={setPlaque} />
      </div>
    );
  }

  const expected = nfcUrl(plaque.public_slug);
  const matched = verifyRun.data?.ok ? verifyRun.data.matched : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[24px] font-bold tracking-tight">Verify Plaque</h1>
        <Button variant="ghost" onClick={() => setPlaque(null)}>
          Change plaque
        </Button>
      </div>

      <GlassPanel className="p-5">
        <Label>Checklist</Label>
        <div className="mt-2">
          <Row label="1 · Plaque ID" value={<Chip tone="ok">{plaque.plaque_code}</Chip>} />
          <Row
            label="2 · NFC tag"
            value={
              matched === null ? (
                <Chip tone="idle">Not scanned</Chip>
              ) : matched ? (
                <Chip tone="ok">Matches ✓</Chip>
              ) : (
                <Chip tone="bad">Mismatch</Chip>
              )
            }
          />
          <Row label="3 · QR code" value={<Chip tone="ok">Generated from the same link</Chip>} />
        </div>
        <p className="mt-3 font-mono text-[12px] break-all text-muted-foreground">{expected}</p>
        {scanned && matched === false ? (
          <p className="mt-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[12px] break-all text-destructive">
            Tag contains: {scanned || "(blank)"}
          </p>
        ) : null}
      </GlassPanel>

      <GlassPanel className="flex flex-col items-center gap-3 p-6 text-center">
        {scanning ? <NfcWaves /> : null}
        {support?.usable ? (
          <Button onClick={scan} disabled={scanning}>
            {scanning ? "Hold tag near your phone…" : "Scan tag to verify"}
          </Button>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            This device can't scan NFC. Use the QR code below and the test link to check the plaque instead.
          </p>
        )}
        {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
      </GlassPanel>

      <GlassPanel className="flex flex-col items-center gap-3 p-6">
        <Label>QR code (same SmartLink)</Label>
        <QrImage value={qrUrl(plaque.public_slug)} />
        <p className="font-mono text-[11px] break-all text-muted-foreground">{qrUrl(plaque.public_slug)}</p>
        <Button variant="ghost" onClick={() => window.open(testUrl(expected), "_blank", "noopener")}>
          Test link (not counted in owner stats)
        </Button>
      </GlassPanel>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => completeRun.mutate()} disabled={matched !== true || completeRun.isPending}>
          {completeRun.data?.ok ? "Assembly complete ✓" : "Mark assembly complete"}
        </Button>
        <Button variant="danger" onClick={() => faultyRun.mutate()} disabled={faultyRun.isPending}>
          {faultyRun.data?.ok ? "Reported faulty" : "Report faulty tag"}
        </Button>
      </div>
      {matched === false ? (
        <p className="text-[12px] text-destructive">
          Mismatches can't be signed off. Reprogram the tag or report it faulty.
        </p>
      ) : null}
    </div>
  );
}
