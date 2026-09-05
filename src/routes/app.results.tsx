import { createFileRoute } from "@tanstack/react-router";
import { GlassPanel } from "@/components/taplocal/Field";
import { usePortal, useOutcomes, useSnapshots } from "@/hooks/usePortal";
import { intentBreakdown, sourceSplit, byHourBucket, byDayOfWeek } from "@/lib/metrics";
import { INTENT_LABEL, PLACEMENT_LABEL } from "@/lib/taplocal";

export const Route = createFileRoute("/app/results")({
  head: () => ({
    meta: [
      { title: "What your plaques changed — TapLocal" },
      {
        name: "description",
        content: "Proven results, results that line up in time, and what we still can't see.",
      },
      { property: "og:title", content: "What your plaques changed — TapLocal" },
      {
        property: "og:description",
        content: "Proven results, results that line up in time, and what we still can't see.",
      },
    ],
  }),
  component: ResultsPage,
});

const OUTCOME_LABEL: Record<string, string> = {
  lead: "leads",
  coupon_redemption: "coupons redeemed",
  booking: "bookings",
  new_review: "new reviews",
  new_follower: "new followers",
  order: "orders",
};

function ResultsPage() {
  const { events, plaques } = usePortal();
  const outcomes = useOutcomes();
  const snapshots = useSnapshots();

  const rows = outcomes.data ?? [];
  const direct = group(rows.filter((o) => o.attribution_type === "direct"));
  const correlated = group(rows.filter((o) => o.attribution_type === "correlated"));
  const split = sourceSplit(events);
  const intents = intentBreakdown(events);
  const hours = byHourBucket(events);
  const busiestDay = byDayOfWeek(events).reduce((a, b) => (b.count > a.count ? b : a));
  const placeCounts = new Map<string, number>();
  for (const e of events.filter((x) => x.event_type === "interaction")) {
    const p = plaques.find((x) => x.id === e.plaque_id);
    const label =
      PLACEMENT_LABEL[p?.placement_type ?? ""] ?? p?.plaque_name ?? p?.plaque_code ?? "Somewhere else";
    placeCounts.set(label, (placeCounts.get(label) ?? 0) + 1);
  }
  const placeTotal = [...placeCounts.values()].reduce((a, b) => a + b, 0) || 1;
  const places = [...placeCounts.entries()]
    .map(([label, count]) => ({ label, count, pct: Math.round((count / placeTotal) * 100) }))
    .sort((a, b) => b.count - a.count);

  const snaps = snapshots.data ?? [];
  const metricKeys = [...new Set(snaps.map((s) => s.metric_type))];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-tight text-balance">
          What your plaques changed
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Last 30 days</p>
      </div>

      <GlassPanel tone="signal" className="p-4">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-accent uppercase">We can prove this</p>
        <div className="mt-2.5 space-y-1.5">
          {direct.length ? (
            direct.map(([key, count]) => (
              <p key={key} className="text-[15px] font-semibold">
                {count} {OUTCOME_LABEL[key] ?? key}
              </p>
            ))
          ) : (
            <p className="text-[13px] text-muted-foreground">Nothing proven yet in this window.</p>
          )}
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          Each of these was followed from the tap all the way to the result.
        </p>
      </GlassPanel>

      <GlassPanel className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            This lines up in time
          </p>
          <span className="rounded-full border border-border bg-foreground/5 px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
            Not directly attributed
          </span>
        </div>
        <div className="mt-2.5 space-y-1.5">
          {correlated.length ? (
            correlated.map(([key, count]) => (
              <p key={key} className="text-[15px] font-semibold">
                {count} {OUTCOME_LABEL[key] ?? key}
              </p>
            ))
          ) : (
            <p className="text-[13px] text-muted-foreground">Nothing lined up in this window yet.</p>
          )}
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          These moved while your plaques were busy. That's a good sign, but we can't prove the plaque caused
          it — Google and Instagram don't tell us who came from where.
        </p>
      </GlassPanel>

      {metricKeys.length ? (
        <GlassPanel className="p-4">
          <p className="font-display text-[14px] font-semibold tracking-tight">Your connected accounts</p>
          <div className="mt-3 space-y-2.5">
            {metricKeys.map((key) => {
              const series = snaps.filter((s) => s.metric_type === key);
              const first = series[0];
              const last = series[series.length - 1];
              if (!first || !last) return null;
              return (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-[13px] text-muted-foreground">{prettyMetric(key)}</span>
                  <span className="text-[13px] font-semibold">
                    {first.metric_value} → {last.metric_value}
                  </span>
                </div>
              );
            })}
          </div>
        </GlassPanel>
      ) : null}

      <GlassPanel className="p-4">
        <p className="font-display text-[14px] font-semibold tracking-tight">What customers wanted</p>
        <div className="mt-3 space-y-2.5">
          {intents.map((i) => (
            <div key={i.intent}>
              <div className="flex justify-between text-[13px]">
                <span>{INTENT_LABEL[i.intent] ?? i.intent}</span>
                <span className="font-semibold">{i.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <div className="h-full rounded-full bg-primary" style={{ width: `${i.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <p className="font-display text-[14px] font-semibold tracking-tight">How customers reached you</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Phone taps" value={split.nfc} />
          <Stat label="QR scans" value={split.qr} />
          <Stat label="Opened the link" value={split.destinationOpens} />
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <p className="font-display text-[14px] font-semibold tracking-tight">Where it happened</p>
        <div className="mt-3 space-y-2.5">
          {places.length ? (
            places.map((r) => (
              <div key={r.label}>
                <div className="flex justify-between text-[13px]">
                  <span>{r.label}</span>
                  <span className="font-semibold">{r.count}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${r.pct}%` }} />
                </div>
              </div>
            ))
          ) : (
            <p className="text-[13px] text-muted-foreground">No taps yet in this window.</p>
          )}
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <p className="font-display text-[14px] font-semibold tracking-tight">When it happened</p>
        <div className="mt-3 grid grid-cols-5 gap-1.5 text-center">
          {hours.map((h) => (
            <div key={h.name} className="rounded-xl border border-border bg-foreground/5 py-2.5">
              <p className="font-display text-[16px] font-bold tracking-tight">{h.count}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{h.name}</p>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[13px] text-muted-foreground">Busiest day: {busiestDay.name}.</p>
      </GlassPanel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-foreground/5 py-2.5">
      <p className="font-display text-[19px] font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function group(rows: Array<{ outcome_type: string }>) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.outcome_type, (map.get(r.outcome_type) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function prettyMetric(key: string) {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
