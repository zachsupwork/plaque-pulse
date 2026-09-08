import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { areaBatchDetail } from "@/lib/area-builder.functions";
import { pad } from "@/lib/area-export";

export const Route = createFileRoute("/admin/batches/$id/print")({
  head: () => ({
    meta: [
      { title: "QR Print Sheet — TapLocal Admin" },
      { name: "description", content: "Printable QR sheet with the business name, plaque code and slug on every block." },
      { property: "og:title", content: "QR Print Sheet — TapLocal Admin" },
      { property: "og:description", content: "Never print a sheet of anonymous QR codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrintSheetPage,
});

type Block = { position: number; name: string; plaqueCode: string; slug: string; qrUrl: string; image: string };

function PrintSheetPage() {
  const { id } = Route.useParams();
  const detailFn = useServerFn(areaBatchDetail);
  const detail = useQuery({ queryKey: ["area-batch", id], queryFn: () => detailFn({ data: { batchId: id } }) });
  const [blocks, setBlocks] = useState<Block[] | null>(null);

  useEffect(() => {
    const rows = detail.data?.rows ?? [];
    if (!rows.length) return;
    let cancelled = false;
    (async () => {
      const built: Block[] = [];
      for (const row of rows) {
        for (const plaque of row.plaques) {
          built.push({
            position: row.position,
            name: row.name,
            plaqueCode: plaque.plaqueCode,
            slug: plaque.slug,
            qrUrl: plaque.qrUrl,
            image: await QRCode.toDataURL(plaque.qrUrl, { width: 600, margin: 1 }),
          });
        }
      }
      if (!cancelled) setBlocks(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [detail.data]);

  const batch = detail.data?.batch;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-[20px] font-bold tracking-tight">{batch?.batchCode ?? "Batch"} — QR print sheet</h1>
          <p className="text-[12px] text-muted-foreground">Every block shows the business, plaque code and slug.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/batches/$id" params={{ id }} className="rounded-xl border border-border px-3 py-2 text-[12px] font-bold">
            Back
          </Link>
          <button type="button" onClick={() => window.print()} className="rounded-xl bg-primary px-3 py-2 text-[12px] font-bold text-primary-foreground">
            Print
          </button>
        </div>
      </div>

      {!blocks ? <p className="text-[13px] text-muted-foreground print:hidden">Generating QR codes…</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(blocks ?? []).map((block) => (
          <div key={block.plaqueCode} className="break-inside-avoid rounded-xl border border-border bg-white p-3 text-center text-black">
            <p className="text-[11px] font-bold">#{pad(block.position)}</p>
            <p className="truncate text-[12px] font-bold uppercase">{block.name}</p>
            <img src={block.image} alt={`QR code for ${block.name}`} className="mx-auto my-2 w-full max-w-[160px]" />
            <p className="text-[11px] font-bold">{block.plaqueCode}</p>
            <p className="text-[11px]">{block.slug}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
