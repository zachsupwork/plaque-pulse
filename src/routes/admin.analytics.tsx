import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GlassPanel, SectionTitle, StatusChip } from "@/components/taplocal/Field";
import { networkAnalytics } from "@/lib/admin-data.functions";
import { DESTINATION_LABEL, PLACEMENT_LABEL } from "@/lib/taplocal";

const search = z.object({
  days: z.coerce.number().int().min(1).max(365).catch(30),
  source: z.enum(["all", "nfc", "qr"]).catch("all"),
});

export const Route = createFileRoute("/admin/analytics")({
  validateSearch: search,
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
  const params = Route.useSearch();
  const navigate = Route.useNavigate();
  const days = params.days;
  const q = useQuery({ queryKey: ["admin-analytics", days], queryFn: () => analyticsFn({ data: { days } }), refetchInterval: 10_000 });
  const a = q.data?.ok ? q.data.analytics : null;
  const peak = a ? Math.max(1, ...a.perDay.map(([, n]) => n)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Across every business on the network. Tap any number to see the taps behind it.
          </p>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => navigate({ search: (prev) => ({ ...prev, days: r }), replace: true })}
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

      {q.data && !q.data.ok ? (
        <GlassPanel className="border-destructive/40 p-4 text-[13px] font-semibold text-destructive">
          Analytics data is unavailable right now. This is a read problem, not a sign that nothing happened.
        </GlassPanel>
      ) : null}

      {a ? (
        <>
          {a.diagnosticWarning ? (
            <GlassPanel className="border-destructive/40 p-3.5 text-[13px] font-semibold text-destructive">
              {a.diagnosticWarning}
            </GlassPanel>
          ) : null}

          <div className="grid grid-cols-3 gap-2.5">
            {(
              [
                [`Interactions (${days}d)`, a.total, "all"],
                ["NFC taps", a.nfc, "nfc"],
                ["QR scans", a.qr, "qr"],
              ] as const
            ).map(([label, value, source]) => (
              <Link
                key={label}
                to="/admin/interactions"
                search={{ period: "window", days, source }}
                className="rounded-2xl border border-border bg-card p-3.5 text-center shadow-[var(--shadow-soft)]"
              >
                <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{label}</p>
                <p className="mt-1 font-display text-[22px] font-bold tracking-tight">{value}</p>
              </Link>
            ))}
          </div>

          <div>
            <SectionTitle>Matching periods ({a.timezone})</SectionTitle>
            <GlassPanel className="divide-y divide-border">
              {(
                [
                  ["Today", a.periods.today, "today", 1],
                  ["Last 7 days", a.periods.days7, "window", 7],
                  ["Last 30 days", a.periods.days30, "window", 30],
                  ["Last 90 days", null, "window", 90],
                  ["All time", a.periods.allTime, "window", 365],
                ] as const
              ).map(([label, p, period, d]) => (
                <Link
                  key={label}
                  to="/admin/interactions"
                  search={{ period, days: d, source: params.source }}
                  className="flex items-center justify-between gap-3 p-3 text-[13px]"
                >
                  <span className="font-semibold">{label}</span>
                  <span className="text-muted-foreground">
                    {p ? (
                      <>
                        <span className="font-bold text-foreground">{p.total}</span> total · {p.nfc} NFC · {p.qr} QR
                      </>
                    ) : (
                      "Open list →"
                    )}
                  </span>
                </Link>
              ))}
              <div className="p-3 text-[12px] text-muted-foreground">
                Last tap: {a.periods.lastNfc ? new Date(a.periods.lastNfc).toLocaleString() : "never"} · Last scan:{" "}
                {a.periods.lastQr ? new Date(a.periods.lastQr).toLocaleString() : "never"}
              </div>
            </GlassPanel>
          </div>

          <div>
            <SectionTitle
              action={
                <Link to="/admin/interactions" search={{ period: "window", days }} className="text-[12px] font-semibold text-primary">
                  Every tap →
                </Link>
              }
            >
              Latest real customer interactions
            </SectionTitle>
            <GlassPanel className="divide-y divide-border">
              {a.latest.length === 0 ? (
                <p className="p-4 text-[13px] text-muted-foreground">No customer interactions yet.</p>
              ) : null}
              {a.latest.map((l) => (
                <Link
                  key={l.id}
                  to="/admin/interactions/$eventId"
                  params={{ eventId: l.id }}
                  className="flex items-center justify-between gap-3 p-3 text-[13px]"
                >
                  <span className="min-w-0 truncate">
                    <StatusChip tone={l.source === "NFC" ? "ok" : "brand"}>{l.source}</StatusChip>
                    <span className="text-muted-foreground">
                      {" "}
                      · {l.business} · {l.plaque || l.slug} · {l.destination} · {l.device}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {new Date(l.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </Link>
              ))}
            </GlassPanel>
          </div>


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
