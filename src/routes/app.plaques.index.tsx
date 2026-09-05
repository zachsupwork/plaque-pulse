import { createFileRoute, Link } from "@tanstack/react-router";
import { GlassPanel, TrendPill } from "@/components/taplocal/Field";
import { usePortal, activeDestination } from "@/hooks/usePortal";
import { DESTINATION_LABEL, PLACEMENT_LABEL } from "@/lib/taplocal";
import { plaqueTrends } from "@/lib/metrics";

export const Route = createFileRoute("/app/plaques/")({
  head: () => ({
    meta: [
      { title: "Your plaques — TapLocal" },
      { name: "description", content: "Every SmartPlaque you own, where it sits and where it sends people." },
      { property: "og:title", content: "Your plaques — TapLocal" },
      { property: "og:description", content: "Every SmartPlaque you own, where it sits and where it sends people." },
    ],
  }),
  component: PlaquesPage,
});

function PlaquesPage() {
  const { plaques, destinations, events } = usePortal();
  const trends = plaqueTrends(events, 30);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold tracking-tight">Your plaques</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {plaques.length === 1 ? "1 plaque" : `${plaques.length} plaques`} · last 30 days
          </p>
        </div>
        <Link
          to="/activate"
          className="shrink-0 rounded-xl bg-primary px-3.5 py-2 text-[13px] font-bold text-primary-foreground"
        >
          + Add plaque
        </Link>
      </div>

      <div className="space-y-2.5">
        {plaques.map((p) => {
          const t = trends.get(p.id);
          const dest = activeDestination(destinations, p.id);
          const paused = p.status === "paused";
          return (
            <Link key={p.id} to="/app/plaques/$id" params={{ id: p.id }} className="block">
              <GlassPanel className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold">{p.plaque_name ?? p.plaque_code}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{p.plaque_code}</p>
                  </div>
                  <TrendPill changePct={t?.changePct ?? null} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Chip>{PLACEMENT_LABEL[p.placement_type ?? ""] ?? "Unplaced"}</Chip>
                  <Chip>
                    {dest ? (DESTINATION_LABEL[dest.destination_type] ?? dest.destination_type) : "Not set up"}
                  </Chip>
                  {paused ? <Chip tone="warn">Paused</Chip> : null}
                  <Chip tone="strong">{(t?.current ?? 0) === 1 ? "1 tap" : `${t?.current ?? 0} taps`}</Chip>
                </div>
              </GlassPanel>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "warn" | "strong" }) {
  const cls =
    tone === "warn"
      ? "border-destructive/30 bg-destructive/15 text-destructive"
      : tone === "strong"
        ? "border-primary/30 bg-primary/15 text-primary"
        : "border-border bg-foreground/5 text-muted-foreground";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[12px] font-medium ${cls}`}>{children}</span>
  );
}
