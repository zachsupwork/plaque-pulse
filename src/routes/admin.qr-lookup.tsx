import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, StatusChip } from "@/components/taplocal/Field";
import { CopyButton, QrSheet } from "@/components/taplocal/LinkTools";
import { DESTINATIONS, buildDestinationUrl, destinationLabel, type DestinationKind } from "@/lib/destinations";
import { PLACEMENT_LABEL } from "@/lib/taplocal";
import { nfcUrl, qrUrl } from "@/lib/smartlink";
import { lookupSmartLink, recordQrPrint, type QrLookupMatch } from "@/lib/qr-lookup.functions";
import { changePlaqueDestination } from "@/lib/places.functions";

export const Route = createFileRoute("/admin/qr-lookup")({
  head: () => ({
    meta: [
      { title: "Find QR — TapLocal admin" },
      { name: "description", content: "Identify which plaque and business a printed QR code belongs to." },
      { property: "og:title", content: "Find QR — TapLocal admin" },
      { property: "og:description", content: "Identify which plaque and business a printed QR code belongs to." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QrLookup,
});

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

function scannerSupported() {
  return typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-t border-border/60 py-2 first:border-t-0">
      <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">{label}</p>
      <div className="mt-0.5 text-[14px] font-semibold break-words">{value}</div>
    </div>
  );
}

function Scanner({ onFound, onClose }: { onFound: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    let raf = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = new Ctor({ formats: ["qr_code"] });
        const tick = async () => {
          if (stop || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const hit = codes[0]?.rawValue;
            if (hit) {
              onFound(hit);
              return;
            }
          } catch {
            /* keep scanning */
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setError("Camera not available. Paste the link or type the slug instead.");
      }
    })();

    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onFound]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-3 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-[16px] font-bold">Scan a printed QR</p>
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-bold">
            Close
          </button>
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} muted playsInline className="h-64 w-full object-cover" />
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {error ?? "Scanning identifies the plaque only — it never counts as a customer scan."}
        </p>
      </div>
    </div>
  );
}

function MatchCard({ match, onRefresh }: { match: QrLookupMatch; onRefresh: () => void }) {
  const [qrOpen, setQrOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<DestinationKind>("google_review");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const destFn = useServerFn(changePlaqueDestination);
  const printFn = useServerFn(recordQrPrint);

  const qr = qrUrl(match.slug);
  const nfc = nfcUrl(match.slug);
  const place = `${match.businessName ?? "Unassigned"}${match.address ? ` · ${match.address}` : ""}`;

  const save = useMutation({
    mutationFn: async () => {
      const option = DESTINATIONS.find((d) => d.kind === kind)!;
      let url = "";
      if (option.input !== "none") {
        url = buildDestinationUrl(kind, value) ?? "";
        if (!url) throw new Error("Enter a valid destination first.");
      }
      const res = await destFn({ data: { plaqueId: match.plaqueId, destinationType: option.dbType, url } });
      if (!res.ok) throw new Error("Could not save that destination.");
      return res;
    },
    onSuccess: () => {
      setEditing(false);
      setError(null);
      onRefresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <GlassPanel className="p-4">
      <p className="text-[12px] font-bold tracking-[0.12em] text-primary uppercase">QR match found ✓</p>

      {match.warnings.map((w) => (
        <div
          key={w.title}
          className={`mt-3 rounded-xl border px-3 py-2 ${
            w.level === "critical" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-foreground/5"
          }`}
        >
          <p className="text-[12px] font-bold uppercase">{w.title}</p>
          <p className="text-[12px]">{w.detail}</p>
        </div>
      ))}

      <div className="mt-3">
        <Row label="Business" value={match.businessName ?? "Not assigned yet"} />
        <Row label="Address" value={match.address ?? match.locationName ?? "—"} />
        <Row label="Plaque" value={match.plaqueCode} />
        <Row label="Slug" value={<span className="font-mono">{match.slug}</span>} />
        <Row label="QR SmartLink" value={<span className="font-mono text-[12px]">{qr}</span>} />
        <Row label="NFC SmartLink" value={<span className="font-mono text-[12px]">{nfc}</span>} />
        <Row label="Destination" value={match.destinationType ? destinationLabel(match.destinationType) : "Not set"} />
        <Row
          label="Placement"
          value={match.placement ? (PLACEMENT_LABEL[match.placement] ?? match.placement) : "Not set"}
        />
        <Row label="Batch" value={match.batchId ?? "—"} />
        <Row label="Design" value={match.designLabel ?? "—"} />
        <Row
          label="QR status"
          value={
            <span className="flex flex-wrap gap-1.5">
              <StatusChip tone={match.verificationStatus === "verified" ? "ok" : "muted"}>
                {match.verificationStatus === "verified" ? "Verified ✓" : "Unverified"}
              </StatusChip>
              <StatusChip tone={match.status === "active" ? "ok" : "muted"}>{match.status}</StatusChip>
            </span>
          }
        />
        <Row
          label="Print history"
          value={
            match.print ? (
              <span className="text-[13px] font-normal">
                QR printed ✓ · {new Date(match.print.printedAt).toLocaleDateString()}
                {match.print.batchId ? ` · Batch ${match.print.batchId}` : ""}
                {match.print.position ? ` · Position #${String(match.print.position).padStart(3, "0")}` : ""}
                {match.print.designVersion ? ` · Design ${match.print.designVersion}` : ""}
                {match.printCount > 1 ? ` · ${match.printCount} print runs` : ""}
              </span>
            ) : (
              <span className="text-[13px] font-normal text-muted-foreground">
                No print run recorded yet — printing from here logs one.
              </span>
            )
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => setQrOpen(true)} className="rounded-xl bg-primary py-2.5 text-[12px] font-bold text-primary-foreground">
          Show QR
        </button>
        {match.placeKey ? (
          <Link
            to="/admin/places/$placeId"
            params={{ placeId: match.placeKey }}
            className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold"
          >
            Open place
          </Link>
        ) : (
          <span className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold text-muted-foreground">No place</span>
        )}
        <Link
          to="/admin/plaques/$id"
          params={{ id: match.plaqueId }}
          className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold"
        >
          Open plaque
        </Link>
        <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-xl border border-border py-2.5 text-[12px] font-bold">
          Change destination
        </button>
        <CopyButton value={qr} label="Copy QR link" className="rounded-xl border border-border py-2.5 text-[12px] font-bold" />
        <CopyButton value={nfc} label="Copy NFC link" className="rounded-xl border border-border py-2.5 text-[12px] font-bold" />
      </div>

      {editing ? (
        <div className="mt-3 rounded-xl border border-border p-3">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as DestinationKind)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px]"
          >
            {DESTINATIONS.map((d) => (
              <option key={d.kind} value={d.kind}>
                {d.label}
              </option>
            ))}
          </select>
          {DESTINATIONS.find((d) => d.kind === kind)!.input !== "none" ? (
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={DESTINATIONS.find((d) => d.kind === kind)!.placeholder ?? ""}
              className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px]"
            />
          ) : null}
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="mt-2 w-full rounded-lg bg-primary py-2.5 text-[13px] font-bold text-primary-foreground disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save destination"}
          </button>
          <p className="mt-2 text-[11px] text-muted-foreground">The physical tag is never rewritten — the link stays the same.</p>
          {error ? <p className="mt-1 text-[12px] text-destructive">{error}</p> : null}
        </div>
      ) : null}

      {qrOpen ? (
        <QrSheet
          url={qr}
          title={match.plaqueCode}
          subtitle={place}
          codeLines={[match.businessName ?? "TapLocal", match.plaqueCode, match.slug]}
          onPrinted={() => {
            void printFn({
              data: {
                plaqueId: match.plaqueId,
                encodedUrl: qr,
                ...(match.batchId ? { batchId: match.batchId } : {}),
                ...(match.designLabel ? { designName: match.designLabel } : {}),
              },
            }).then(onRefresh);
          }}
          onClose={() => setQrOpen(false)}
        />
      ) : null}
    </GlassPanel>
  );
}

function QrLookup() {
  const lookupFn = useServerFn(lookupSmartLink);
  const [input, setInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ match: QrLookupMatch | null; searched: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = useMutation({
    mutationFn: async (raw: string) => {
      const res = await lookupFn({ data: { query: raw } });
      if (!res.ok) throw new Error("You need admin access for this tool.");
      return res;
    },
    onSuccess: (res, raw) => {
      setError(null);
      setResult({ match: res.match, searched: raw });
    },
    onError: (e: Error) => setError(e.message),
  });

  function run(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setInput(value);
    lookup.mutate(value);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Find QR</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Paste a printed QR link, scan the code, or type the slug or plaque code. Nothing here counts as a customer scan.
        </p>
      </div>

      <GlassPanel className="p-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run(input);
          }}
          placeholder="https://taplocaldigital.lovable.app/q/RRNWS4 · /q/RRNWS4 · RRNWS4 · TL-467784"
          className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[14px] outline-none focus:border-primary/60"
        />
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => run(input)}
            disabled={lookup.isPending}
            className="rounded-xl bg-primary py-2.5 text-[13px] font-bold text-primary-foreground disabled:opacity-60"
          >
            {lookup.isPending ? "Looking up…" : "Find plaque"}
          </button>
          <button
            type="button"
            onClick={() => setScanning(true)}
            disabled={!scannerSupported()}
            className="rounded-xl border border-border py-2.5 text-[13px] font-bold disabled:opacity-50"
          >
            {scannerSupported() ? "Scan QR" : "Scanning unavailable"}
          </button>
        </div>
        {error ? <p className="mt-2 text-[12px] text-destructive">{error}</p> : null}
      </GlassPanel>

      {result && !result.match ? (
        <GlassPanel className="p-4">
          <p className="text-[13px] font-bold">No plaque matches that code.</p>
          <p className="mt-1 text-[12px] text-muted-foreground break-all">
            Searched: {result.searched}. Try the plaque code printed under the QR, or search everything from{" "}
            <Link to="/admin/places" className="font-semibold text-primary">
              Places
            </Link>
            .
          </p>
        </GlassPanel>
      ) : null}

      {result?.match ? <MatchCard match={result.match} onRefresh={() => run(result.searched)} /> : null}

      {scanning ? (
        <Scanner
          onClose={() => setScanning(false)}
          onFound={(value) => {
            setScanning(false);
            run(value);
          }}
        />
      ) : null}
    </div>
  );
}
