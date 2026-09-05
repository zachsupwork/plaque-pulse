import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, Stat } from "@/components/taplocal/Field";
import { networkAnalytics } from "@/lib/admin-data.functions";
import { DESTINATION_LABEL, PLACEMENT_LABEL } from "@/lib/taplocal";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Network analytics — TapLocal admin" },
      { name: "description", content: "Which placements, destinations and businesses drive TapLocal taps." },
      { property: "og:title", content: "Network analytics — TapLocal admin" },
      { property: "og:description", content: "Which placements, destinations and businesses drive TapLocal taps." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Analytics,
});

const RANGES = [7, 30, 90] as const;

function Analytics() {
  const analyticsFn = useServerFn(networkAnalytics);
  const [days, setDays] = useState<number>(30);
  const q = useQuery({ queryKey: ["admin-analytics", days], queryFn: () => analyticsFn({ data: { days } }) });
  const a = q.data?.ok ? q.data.analytics : null;
  const peak = a ? Math.max(1, ...a.perDay.map(([, n]) => n)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Across every business on the network.</p>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDays(r)}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                days === r ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? <p className="text-[13px] text-muted-foreground">Loading…</p> : null}

      {a ? (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="Interactions" value={a.total} />
            <Stat label="NFC taps" value={a.nfc} />
            <Stat label="QR scans" value={a.qr} />
          </div>

          <div>
            <SectionTitle>Daily volume</SectionTitle>
            <GlassPanel className="flex h-32 items-end gap-1 p-3">
              {a.perDay.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No interactions in this window.</p>
              ) : null}
              {a.perDay.map(([day, count]) => (
                <div
                  key={day}
                  title={`${day}: ${count}`}
                  className="flex-1 rounded-t bg-primary/70"
                  style={{ height: `${Math.max(4, (count / peak) * 100)}%` }}
                />
              ))}
            </GlassPanel>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <RankList
              title="Placements"
              rows={a.placements.map(([k, n]) => [PLACEMENT_LABEL[k] ?? k, n] as const)}
            />
            <RankList
              title="Destinations"
              rows={a.destinations.map(([k, n]) => [DESTINATION_LABEL[k] ?? k, n] as const)}
            />
          </div>

          <div>
            <SectionTitle>Top plaques</SectionTitle>
            <GlassPanel className="divide-y divide-border">
              {a.topPlaques.map((p) => (
                <Link key={p.id} to="/admin/plaques/$id" params={{ id: p.id }} className="flex items-center justify-between gap-3 p-3.5 text-[13px]">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{p.label}</span>
                    <span className="text-muted-foreground"> · {p.business}</span>
                  </span>
                  <span className="shrink-0 font-bold">{p.count}</span>
                </Link>
              ))}
              {a.topPlaques.length === 0 ? <p className="p-4 text-[13px] text-muted-foreground">Nothing yet.</p> : null}
            </GlassPanel>
          </div>

          <div>
            <SectionTitle>Top businesses</SectionTitle>
            <GlassPanel className="divide-y divide-border">
              {a.topBusinesses.map((b) => (
                <Link key={b.id} to="/admin/businesses/$id" params={{ id: b.id }} className="flex items-center justify-between gap-3 p-3.5 text-[13px]">
                  <span className="truncate font-semibold">{b.name}</span>
                  <span className="shrink-0 font-bold">{b.count}</span>
                </Link>
              ))}
              {a.topBusinesses.length === 0 ? <p className="p-4 text-[13px] text-muted-foreground">Nothing yet.</p> : null}
            </GlassPanel>
          </div>

          <div>
            <SectionTitle>Live plaques with no taps</SectionTitle>
            <GlassPanel className="divide-y divide-border">
              {a.silentPlaques.length === 0 ? (
                <p className="p-4 text-[13px] text-muted-foreground">Every live plaque got used. Good.</p>
              ) : null}
              {a.silentPlaques.map((p) => (
                <Link key={p.id} to="/admin/plaques/$id" params={{ id: p.id }} className="block p-3.5 text-[13px]">
                  <span className="font-semibold">{p.label}</span>
                  <span className="text-muted-foreground"> · {p.business}</span>
                </Link>
              ))}
            </GlassPanel>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RankList({ title, rows }: { title: string; rows: readonly (readonly [string, number])[] }) {
  const top = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <GlassPanel className="space-y-2 p-3.5">
        {rows.length === 0 ? <p className="text-[13px] text-muted-foreground">No data yet.</p> : null}
        {rows.slice(0, 8).map(([label, count]) => (
          <div key={label}>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold">{label}</span>
              <span className="text-muted-foreground">{count}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-foreground/10">
              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(count / top) * 100}%` }} />
            </div>
          </div>
        ))}
      </GlassPanel>
    </div>
  );
}
