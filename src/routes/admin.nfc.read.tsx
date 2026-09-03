import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import { Button, Chip, CopyButton, Label, NfcWaves, Row, useNfcSupport } from "@/components/taplocal/NfcKit";
import { nfcErrorMessage, readOnce, type NdefReadResult } from "@/lib/nfc-client";
import { nfcUrl, parseSmartLink, testUrl } from "@/lib/smartlink";
import { getPlaqueProgramming } from "@/lib/nfc.functions";

export const Route = createFileRoute("/admin/nfc/read")({
  head: () => ({
    meta: [
      { title: "Read NFC Tag — TapLocal NFC Tools" },
      { name: "description", content: "Scan an NFC tag and see exactly what is stored on it." },
      { property: "og:title", content: "Read NFC Tag — TapLocal" },
      { property: "og:description", content: "Scan an NFC tag and see exactly what is stored on it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReadPage,
});

type Resolved = Awaited<ReturnType<typeof getPlaqueProgramming>>;

function ReadPage() {
  const support = useNfcSupport();
  const navigate = useNavigate();
  const lookup = useServerFn(getPlaqueProgramming);

  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<NdefReadResult | null>(null);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const [manual, setManual] = useState("");

  async function inspect(url: string) {
    const link = parseSmartLink(url);
    if (!link) {
      setResolved(null);
      return;
    }
    setResolved(await lookup({ data: { slug: link.slug } }));
  }

  async function startScan() {
    setError(null);
    setResult(null);
    setResolved(null);
    setScanning(true);
    try {
      const read = await readOnce();
      setResult(read);
      if (read.url) await inspect(read.url);
      else setError("This tag has no NDEF records we can read (it may be blank).");
    } catch (err) {
      setError(nfcErrorMessage(err));
    } finally {
      setScanning(false);
    }
  }

  const url = result?.url ?? null;
  const plaque = resolved?.plaque ?? null;
  const expected = plaque ? nfcUrl(plaque.public_slug) : null;
  const matched = Boolean(expected && url && url.replace(/\/$/, "") === expected);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Read NFC Tag</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">Hold an NFC tag near your device.</p>
      </div>

      <GlassPanel className="p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {scanning ? <NfcWaves /> : <span className="text-[40px]">📱</span>}
          <p className="text-[15px] font-bold">
            {scanning ? "Hold tag near your phone" : result ? "✓ Tag found" : "Ready to scan"}
          </p>
          {support?.usable ? (
            <Button onClick={startScan} disabled={scanning}>
              {scanning ? "Scanning…" : "Start scan"}
            </Button>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              NFC reading is not supported in this browser/device. Paste a tag URL below to look it up instead.
            </p>
          )}
        </div>

        {!support?.usable ? (
          <div className="mt-4 flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="https://go.taplocaldigital.com/n/X8K2P4"
              className="w-full rounded-xl border border-border bg-foreground/5 px-3 py-2.5 text-[13px] outline-none focus:border-primary/60"
            />
            <Button
              onClick={() => {
                setResult({ serialNumber: null, records: [{ recordType: "url", mediaType: null, encoding: null, lang: null, value: manual }], url: manual });
                void inspect(manual);
              }}
            >
              Look up
            </Button>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-[13px] text-destructive">{error}</p> : null}
      </GlassPanel>

      {result ? (
        <GlassPanel className="p-5">
          <Label>Tag content</Label>
          <div className="mt-2">
            <Row label="Record type" value={result.records[0]?.recordType ?? "—"} />
            <Row label="URL" value={<span className="font-mono">{url ?? "—"}</span>} />
            <Row label="Records" value={String(result.records.length)} />
            {result.serialNumber ? <Row label="Serial number" value={result.serialNumber} /> : null}
          </div>
          <button
            type="button"
            onClick={() => setRaw((v) => !v)}
            className="mt-3 text-[12px] font-semibold text-muted-foreground underline"
          >
            {raw ? "Hide raw NDEF data" : "Show raw NDEF data"}
          </button>
          {raw ? (
            <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-foreground/5 p-3 text-[11px] text-muted-foreground">
              {JSON.stringify(result.records, null, 2)}
            </pre>
          ) : null}
        </GlassPanel>
      ) : null}

      {result && plaque ? (
        <GlassPanel className="p-5">
          <p className="text-[15px] font-bold text-accent">Detected TapLocal SmartPlaque</p>
          <div className="mt-2">
            <Row label="Plaque" value={plaque.plaque_code} />
            <Row label="Product" value={plaque.product_type} />
            <Row label="Batch" value={plaque.batch_id ?? "—"} />
            <Row label="Status" value={<Chip tone="idle">{plaque.status}</Chip>} />
            <Row
              label="Expected link"
              value={matched ? <Chip tone="ok">MATCH ✓</Chip> : <Chip tone="bad">MISMATCH</Chip>}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => navigate({ to: "/admin/plaques/$id/program", params: { id: plaque.id } })}>
              Open plaque
            </Button>
            <Button onClick={() => navigate({ to: "/admin/nfc/verify", search: { code: plaque.plaque_code } })}>
              Verify
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate({ to: "/admin/plaques/$id/program", params: { id: plaque.id } })}
            >
              Reprogram
            </Button>
            <Button variant="ghost" onClick={() => window.open(testUrl(nfcUrl(plaque.public_slug)), "_blank", "noopener")}>
              Test link
            </Button>
          </div>
        </GlassPanel>
      ) : null}

      {result && url && !plaque ? (
        <GlassPanel className="p-5">
          <p className="text-[15px] font-bold">External / unknown NFC tag</p>
          <Row label="Stored URL" value={<span className="font-mono">{url}</span>} />
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton value={url} label="Copy" />
            <Button variant="ghost" onClick={() => window.open(url, "_blank", "noopener")}>
              Open
            </Button>
            <Button variant="ghost" onClick={() => navigate({ to: "/admin/nfc/write" })}>
              Rewrite as TapLocal tag
            </Button>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Rewriting takes you to the writer so you choose which plaque this tag belongs to first.
          </p>
        </GlassPanel>
      ) : null}
    </div>
  );
}
