import { createFileRoute, Link } from "@tanstack/react-router";
import { GlassPanel, TrendPill } from "@/components/taplocal/Field";
import { usePortal, useOutcomes, activeDestination } from "@/hooks/usePortal";
import { DESTINATION_LABEL, PLACEMENT_LABEL } from "@/lib/taplocal";
import { trendFor, plaqueTrends, peakWindow, byDayOfWeek } from "@/lib/metrics";
import { CopilotDock } from "@/components/taplocal/CopilotDock";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Your plaques today — TapLocal" },
      { name: "description", content: "How your SmartPlaques performed over the last 30 days." },
      { property: "og:title", content: "Your plaques today — TapLocal" },
      { property: "og:description", content: "How your SmartPlaques performed over the last 30 days." },
    ],
  }),
  component: PortalHome,
});

function PortalHome() {
  const { business, plaques, destinations, events, recommendations } = usePortal();
  const outcomes = useOutcomes();

  const trend = trendFor(events, 30);
  const total = trend.current;
  const changePct = trend.changePct;
  const trends = plaqueTrends(events, 30);
  const peak = peakWindow(events);
  const busiestDay = byDayOfWeek(events).reduce((a, b) => (b.count > a.count ? b : a));
  const direct = (outcomes.data ?? []).filter((o) => o.attribution_type === "direct");
  const rec = recommendations[0];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] text-muted-foreground">{business?.name ?? "Loading"}</p>
        <h1 className="mt-1 font-display text-[26px] leading-tight font-bold tracking-tight text-balance">
          Your plaques were tapped {total} times in the last 30 days
        </h1>
      </div>

      <GlassPanel sheen className="p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[12px] text-muted-foreground">Total interactions</p>
            <p className="font-display text-[40px] leading-none font-bold tracking-tight">{total}</p>
          </div>
          <TrendPill changePct={changePct} />
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {total > 0
            ? `Busiest stretch: ${busiestDay.name} ${peak.toLowerCase()}.`
            : "Not enough activity yet to spot a busy stretch."}
        </p>
      </GlassPanel>

      <section>
        <h2 className="font-display text-[15px] font-semibold tracking-tight">Plaque by plaque</h2>
        <div className="mt-2.5 space-y-2.5">
          {plaques.map((p) => {
            const t = trends.get(p.id);
            const dest = activeDestination(destinations, p.id);
            return (
              <Link key={p.id} to="/app/plaques/$id" params={{ id: p.id }} className="block">
                <GlassPanel className="p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">{p.plaque_name ?? p.plaque_code}</p>
                      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                        {PLACEMENT_LABEL[p.placement_type ?? ""] ?? p.placement_type ?? "Unplaced"} ·{" "}
                        {dest ? DESTINATION_LABEL[dest.destination_type] ?? dest.destination_type : "Not set up"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="font-display text-[20px] font-bold tracking-tight">{t?.current ?? 0}</span>
                      <TrendPill changePct={t?.changePct ?? null} />
                    </div>
                  </div>
                </GlassPanel>
              </Link>
            );
          })}
        </div>
      </section>

      <GlassPanel className="p-4">
        <p className="text-[12px] font-semibold tracking-wide text-accent uppercase">What we can prove</p>
        <p className="mt-2 text-[14px] leading-relaxed text-pretty">
          {direct.length} results came straight from a tap — a lead, a coupon or a booking we followed all the
          way through. Reviews and follows moved too, but those we can only line up in time, not prove.
        </p>
        <Link to="/app/results" className="mt-3 inline-block text-[13px] font-semibold text-primary">
          See the full picture →
        </Link>
      </GlassPanel>

      {rec ? (
        <GlassPanel className="border-primary/40 bg-primary/10 p-4">
          <p className="text-[12px] font-semibold tracking-wide uppercase">Worth trying</p>
          <p className="mt-1.5 text-[14px] font-semibold">{rec.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-foreground/85 text-pretty">{rec.explanation}</p>
        </GlassPanel>
      ) : null}

      <CopilotDock />
    </div>
  );
}
