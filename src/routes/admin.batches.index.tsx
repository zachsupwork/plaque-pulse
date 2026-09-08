import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, StatusChip } from "@/components/taplocal/Field";
import { listAreaBatches } from "@/lib/area-builder.functions";

export const Route = createFileRoute("/admin/batches/")({
  head: () => ({
    meta: [
      { title: "Area Batches — TapLocal Admin" },
      { name: "description", content: "Every street and neighbourhood batch you've prepared for canvassing." },
      { property: "og:title", content: "Area Batches — TapLocal Admin" },
      { property: "og:description", content: "Street batches, plaques, QR downloads and field mode." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BatchesPage,
});

function BatchesPage() {
  const list = useServerFn(listAreaBatches);
  const batches = useQuery({ queryKey: ["area-batches"], queryFn: () => list({ data: undefined }) });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold tracking-tight">Area batches</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">Street runs you've prepared.</p>
        </div>
        <Link to="/admin/area-builder" className="rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground">
          New area
        </Link>
      </div>

      <div className="space-y-2">
        {(batches.data?.batches ?? []).map((b) => (
          <Link key={b.id} to="/admin/batches/$id" params={{ id: b.id }} className="block">
            <GlassPanel className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold">{b.batchCode}</p>
                <p className="truncate text-[12px] text-muted-foreground">{b.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {b.places} places · {b.plaques} plaques · {b.accepted} accepted
                </p>
              </div>
              <StatusChip tone={b.mode === "plaques" ? "ok" : "idle"}>
                {b.mode === "plaques" ? "Plaques created" : "Prospect list"}
              </StatusChip>
            </GlassPanel>
          </Link>
        ))}
        {batches.isFetched && !(batches.data?.batches ?? []).length ? (
          <p className="text-[13px] text-muted-foreground">No area batches yet. Start with Area Builder.</p>
        ) : null}
      </div>
    </div>
  );
}
