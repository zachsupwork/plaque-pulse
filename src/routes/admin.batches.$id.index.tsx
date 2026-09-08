import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, StatusChip } from "@/components/taplocal/Field";
import { CopyButton } from "@/components/taplocal/LinkTools";
import {
  PROSPECT_STATUSES,
  areaBatchDetail,
  processAreaChunk,
  researchProspect,
  setProspectStatus,
} from "@/lib/area-builder.functions";
import {
  buildBatchZip,
  download,
  fileSafe,
  linksCsv,
  manifestCsv,
  pad,
  plaqueSheet,
  qrPngBytes,
  type ExportRow,
} from "@/lib/area-export";

export const Route = createFileRoute("/admin/batches/$id/")({
  head: () => ({
    meta: [
      { title: "Batch — TapLocal Admin" },
      { name: "description", content: "Every place, plaque, QR code and canvassing status in one prepared batch." },
      { property: "og:title", content: "Batch — TapLocal Admin" },
      { property: "og:description", content: "Manage a prepared street batch and download its QR pack." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BatchDetailPage,
});

const STATUS_TONE: Record<string, "ok" | "attention" | "problem" | "idle" | "brand"> = {
  not_visited: "idle",
  interested: "brand",
  accepted: "ok",
  follow_up: "attention",
  declined: "problem",
  installed: "ok",
  existing_customer: "brand",
};

function BatchDetailPage() {
  const { id } = Route.useParams();
  const detailFn = useServerFn(areaBatchDetail);
  const chunkFn = useServerFn(processAreaChunk);
  const statusFn = useServerFn(setProspectStatus);
  const researchFn = useServerFn(researchProspect);

  const [busy, setBusy] = useState<string | null>(null);
  const [fieldMode, setFieldMode] = useState(false);
  const [fieldIndex, setFieldIndex] = useState(0);

  const detail = useQuery({ queryKey: ["area-batch", id], queryFn: () => detailFn({ data: { batchId: id } }) });
  const batch = detail.data?.batch ?? null;
  const rows = useMemo(() => (detail.data?.rows ?? []) as unknown as ExportRow[], [detail.data]);
  const plaqueCount = rows.reduce((sum, r) => sum + r.plaques.length, 0);
  const needsAttention = (detail.data?.rows ?? []).filter((r) => r.error).length;

  async function retryPending() {
    setBusy("Retrying…");
    for (let i = 0; i < 200; i += 1) {
      const step = await chunkFn({ data: { batchId: id, limit: 3 } });
      if (!step.ok || step.processed === 0 || step.remaining === 0) break;
      setBusy(`Retrying… ${step.remaining} left`);
    }
    await detail.refetch();
    setBusy(null);
  }

  async function downloadZip() {
    if (!batch) return;
    setBusy("Building the download…");
    const zipped = await buildBatchZip(rows, batch.batchCode, batch.designType, (done, total) =>
      setBusy(`Generating QR codes ${done} / ${total}…`),
    );
    download(`${batch.batchCode}.zip`, zipped as unknown as BlobPart, "application/zip");
    setBusy(null);
  }

  async function downloadQrCodes() {
    if (!batch) return;
    setBusy("Generating QR codes…");
    for (const row of rows) {
      for (const plaque of row.plaques) {
        const bytes = await qrPngBytes(plaque.qrUrl);
        download(
          `${pad(row.position)}_${fileSafe(row.name)}_${plaque.plaqueCode}_${plaque.slug}_QR.png`,
          bytes as unknown as BlobPart,
          "image/png",
        );
      }
    }
    setBusy(null);
  }

  function downloadPlaqueSheets() {
    if (!batch) return;
    for (const row of rows) {
      for (const plaque of row.plaques) {
        download(
          `${pad(row.position)}_${fileSafe(row.name)}_${plaque.plaqueCode}.txt`,
          plaqueSheet(row, plaque, batch.batchCode, batch.designType),
          "text/plain",
        );
      }
    }
  }

  if (detail.isLoading) return <p className="text-[13px] text-muted-foreground">Loading batch…</p>;
  if (!batch) return <p className="text-[13px] text-muted-foreground">That batch no longer exists.</p>;

  if (fieldMode) {
    const row = (detail.data?.rows ?? [])[fieldIndex];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-display text-[18px] font-bold">{batch.batchCode} · Field mode</p>
          <button type="button" className="rounded-xl border border-border px-3 py-2 text-[12px] font-bold" onClick={() => setFieldMode(false)}>
            Exit
          </button>
        </div>
        {row ? (
          <GlassPanel className="space-y-3 p-4">
            <div>
              <p className="text-[12px] text-muted-foreground">#{pad(row.position)}</p>
              <h2 className="font-display text-[22px] font-bold tracking-tight">{row.name}</h2>
              <p className="text-[13px] text-muted-foreground">{row.address}</p>
              <div className="mt-2">
                <StatusChip tone={STATUS_TONE[row.status] ?? "idle"}>{row.status.replace(/_/g, " ")}</StatusChip>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(["accepted", "follow_up", "declined"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  className="rounded-xl border border-border px-2 py-3 text-[12px] font-bold"
                  onClick={async () => {
                    await statusFn({ data: { prospectId: row.id, status } });
                    await detail.refetch();
                  }}
                >
                  {status === "follow_up" ? "Follow up" : status === "accepted" ? "Accepted" : "Declined"}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {row.mapsUri ? (
                <a href={row.mapsUri} target="_blank" rel="noreferrer" className="rounded-xl border border-border px-3 py-2.5 text-center text-[12px] font-bold">
                  Open Google
                </a>
              ) : null}
              {row.plaques[0] ? (
                <Link
                  to="/admin/plaques/$id"
                  params={{ id: row.plaques[0].id }}
                  className="rounded-xl border border-border px-3 py-2.5 text-center text-[12px] font-bold"
                >
                  Set up plaque
                </Link>
              ) : (
                <Link to="/admin/setup" className="rounded-xl border border-border px-3 py-2.5 text-center text-[12px] font-bold">
                  Set up plaque
                </Link>
              )}
            </div>

            {row.status === "declined" && row.plaques[0] ? (
              <div className="rounded-xl border border-border bg-foreground/5 p-3">
                <p className="text-[12px] font-bold">Reuse this plaque?</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {row.plaques[0].plaqueCode} · generic design, QR and NFC all reusable.
                </p>
                <Link
                  to="/admin/reassign/$plaqueId"
                  params={{ plaqueId: row.plaques[0].id }}
                  className="mt-2 block rounded-xl bg-primary px-3 py-2.5 text-center text-[12px] font-bold text-primary-foreground"
                >
                  Reassign to another place
                </Link>
              </div>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-border px-3 py-2.5 text-[12px] font-bold"
                onClick={() => setFieldIndex((i) => Math.max(0, i - 1))}
                disabled={fieldIndex === 0}
              >
                ← Previous
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-[12px] font-bold text-primary-foreground"
                onClick={() => setFieldIndex((i) => Math.min((detail.data?.rows ?? []).length - 1, i + 1))}
              >
                Next place →
              </button>
            </div>
          </GlassPanel>
        ) : (
          <p className="text-[13px] text-muted-foreground">No places in this batch.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">{batch.batchCode}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {batch.name} · {rows.length} places · {plaqueCount} plaques ·{" "}
          {batch.designType === "branded" ? "Business-specific artwork" : "Generic reusable design ✓"}
        </p>
      </div>

      <GlassPanel className="space-y-2 p-4">
        <SectionTitle>Download batch</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => void downloadZip()} className="rounded-xl bg-primary px-3 py-2.5 text-[12px] font-bold text-primary-foreground">
            Download all (ZIP)
          </button>
          <button type="button" onClick={() => void downloadQrCodes()} className="rounded-xl border border-border px-3 py-2.5 text-[12px] font-bold">
            QR codes
          </button>
          <button
            type="button"
            onClick={() => download(`${batch.batchCode}_MANIFEST.csv`, manifestCsv(rows, batch.batchCode, batch.designType), "text/csv")}
            className="rounded-xl border border-border px-3 py-2.5 text-[12px] font-bold"
          >
            Manifest CSV
          </button>
          <button
            type="button"
            onClick={() => download(`${batch.batchCode}_LINKS.csv`, linksCsv(rows), "text/csv")}
            className="rounded-xl border border-border px-3 py-2.5 text-[12px] font-bold"
          >
            Links CSV
          </button>
          <Link to="/admin/batches/$id/print" params={{ id }} className="rounded-xl border border-border px-3 py-2.5 text-center text-[12px] font-bold">
            Print QR sheet
          </Link>
          <button type="button" onClick={downloadPlaqueSheets} className="rounded-xl border border-border px-3 py-2.5 text-[12px] font-bold">
            Plaque records
          </button>
        </div>
        {busy ? <p className="text-[12px] text-muted-foreground">{busy}</p> : null}
      </GlassPanel>

      <GlassPanel className="space-y-2 p-4">
        <SectionTitle>Next steps</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setFieldMode(true)} className="rounded-xl border border-border px-3 py-2.5 text-[12px] font-bold">
            Field mode
          </button>
          <Link to="/admin/nfc/batch" className="rounded-xl border border-border px-3 py-2.5 text-center text-[12px] font-bold">
            Start NFC programming
          </Link>
        </div>
        <p className="text-[11px] text-muted-foreground">
          NFC tags still need a physical write and verify: {plaqueCount ? `0 of ${plaqueCount} programmed here` : "no plaques yet"}.
        </p>
        {needsAttention ? (
          <button type="button" onClick={() => void retryPending()} className="w-full rounded-xl border border-destructive px-3 py-2.5 text-[12px] font-bold text-destructive">
            {needsAttention} need attention — retry
          </button>
        ) : null}
      </GlassPanel>

      <div className="space-y-2">
        {(detail.data?.rows ?? []).map((row) => (
          <GlassPanel key={row.id} className="space-y-2 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">#{pad(row.position)}</p>
                <p className="truncate text-[14px] font-bold">{row.name}</p>
                <p className="truncate text-[12px] text-muted-foreground">{row.address}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {row.website ? "Website ✓" : "Website ?"} ·{" "}
                  {row.instagram ? `Instagram ✓ @${row.instagram.replace(/^@/, "")}` : "Instagram ?"}
                </p>
              </div>
              <div className="shrink-0 space-y-1 text-right">
                <StatusChip tone={STATUS_TONE[row.status] ?? "idle"}>{row.status.replace(/_/g, " ")}</StatusChip>
                <select
                  className="block rounded-lg border border-border bg-card px-2 py-1 text-[11px]"
                  value={row.status}
                  onChange={async (e) => {
                    await statusFn({ data: { prospectId: row.id, status: e.target.value as never } });
                    await detail.refetch();
                  }}
                >
                  {PROSPECT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {row.plaques.map((plaque) => (
              <div key={plaque.id} className="rounded-xl border border-border bg-foreground/5 p-2.5">
                <p className="text-[12px] font-bold">
                  {plaque.plaqueCode} · {plaque.slug}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  QR ✓ · {plaque.writeStatus === "verified" ? "NFC verified" : "NFC needs programming"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Link to="/admin/plaques/$id" params={{ id: plaque.id }} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold">
                    Manage
                  </Link>
                  <Link
                    to="/admin/plaques/$id/program"
                    params={{ id: plaque.id }}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold"
                  >
                    Program
                  </Link>
                  <CopyButton value={plaque.qrUrl} label="Copy QR link" className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold" />
                  <CopyButton value={plaque.nfcUrl} label="Copy NFC link" className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold" />
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-1.5">
              {row.businessId ? (
                <Link to="/admin/businesses/$id" params={{ id: row.businessId }} className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold">
                  Open business
                </Link>
              ) : null}
              {row.mapsUri ? (
                <a href={row.mapsUri} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold">
                  Google listing
                </a>
              ) : null}
              <button
                type="button"
                className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold"
                onClick={async () => {
                  setBusy(`Researching ${row.name}…`);
                  await researchFn({ data: { prospectId: row.id } });
                  await detail.refetch();
                  setBusy(null);
                }}
              >
                Research links
              </button>
            </div>
            {row.error ? <p className="text-[11px] text-destructive">Needs attention: {row.error.replace(/_/g, " ")}</p> : null}
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}
