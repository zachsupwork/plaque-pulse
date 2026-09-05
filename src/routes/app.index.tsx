import { createFileRoute, Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { GlassPanel, SectionTitle, Stat, TrendPill } from "@/components/taplocal/Field";
import { usePortal, useOutcomes, useLocations, activeDestination } from "@/hooks/usePortal";
import { DESTINATION_LABEL, PLACEMENT_LABEL } from "@/lib/taplocal";
import { trendFor, plaqueTrends, peakWindow, byDayOfWeek } from "@/lib/metrics";
import { CopilotDock } from "@/components/taplocal/CopilotDock";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Your business this month — TapLocal" },
      { name: "description", content: "Reviews, taps and what TapLocal noticed about your plaques." },
      { property: "og:title", content: "Your business this month — TapLocal" },
      { property: "og:description", content: "Reviews, taps and what TapLocal noticed about your plaques." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortalHome,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function PortalHome() {
  const { business, plaques, destinations, events, recommendations, isLoading } = usePortal();
  const outcomes = useOutcomes();
  const { data: locations } = useLocations();

  const trend = trendFor(events, 30);
  const total = trend.current;
  const trends = plaqueTrends(events, 30);
  const peak = peakWindow(events);
  const busiestDay = byDayOfWeek(events).reduce((a, b) => (b.count > a.count ? b : a));
  const direct = (outcomes.data ?? []).filter((o) => o.attribution_type === "direct");
  const rec = recommendations[0];
  const place = locations?.[0];

  const best = plaques
    .map((p) => ({ p, count: trends.get(p.id)?.current ?? 0 }))
    .sort((a, b) => b.count - a.count)[0];

  if (!isLoading && total === 0) {
    return (
      <div className="space-y-5">
        <Greeting name={business?.name} />
        <GlassPanel tone="signal" className="p-5 text-center">
          <p className="font-display text-[16px] font-bold tracking-tight">Waiting for your first tap</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground text-pretty">
            Your plaques are live. As soon as a customer taps one, the results will start showing up here —
            usually within the first day.
          </p>
          <Link
            to="/app/plaques"
            className="mt-4 inline-block rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground"
          >
            Check my plaques
          </Link>
        </GlassPanel>
        <CopilotDock />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Greeting name={business?.name} />

      <section>
        <SectionTitle>Your business this month</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          <Stat
            label="Google reviews"
            value={place?.google_review_count ?? "—"}
            hint={place?.google_review_count == null ? "Connect your Google listing" : "From your public listing"}
          />
          <Stat
            label="Rating"
            value={place?.google_rating != null ? place.google_rating.toFixed(1) : "—"}
            hint={place?.google_rating == null ? "Connect your Google listing" : "Out of 5"}
          />
          <Stat label="Taps on your plaques" value={total} hint="Last 30 days" />
          <Stat
            label="Best spot"
            tone="muted"
            value={
              best && best.count > 0
                ? (PLACEMENT_LABEL[best.p.placement_type ?? ""] ?? best.p.plaque_name ?? "—")
                : "Not enough taps yet"
            }
            hint={best && best.count > 0 ? `${best.count} taps` : undefined}
          />
        </div>
        <GlassPanel className="mt-2.5 flex items-center justify-between gap-3 p-3.5">
          <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
            {total > 0
              ? `Busiest stretch: ${busiestDay.name} ${peak.toLowerCase()}.`
              : "Not enough activity yet to spot a busy stretch."}
          </p>
          <TrendPill changePct={trend.changePct} size="sm" />
        </GlassPanel>
      </section>

      <CopilotDock />

      {rec ? (
        <section>
          <SectionTitle>TapLocal noticed</SectionTitle>
          <GlassPanel tone="brand" className="p-4">
            <p className="text-[14px] font-semibold">{rec.title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/85 text-pretty">{rec.explanation}</p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <Link
                to="/app/plaques"
                className="rounded-xl bg-primary px-3.5 py-2 text-[13px] font-bold text-primary-foreground"
              >
                Try this
              </Link>
              <button
                type="button"
                className="rounded-xl border border-border bg-foreground/10 px-3.5 py-2 text-[13px] font-semibold"
              >
                Ask why
              </button>
              <button type="button" className="rounded-xl px-3.5 py-2 text-[13px] font-semibold text-muted-foreground">
                Not now
              </button>
            </div>
          </GlassPanel>
        </section>
      ) : null}

      <section>
        <SectionTitle
          action={
            <Link to="/app/plaques" className="text-[12px] font-semibold text-primary">
              See all
            </Link>
          }
        >
          Your plaques
        </SectionTitle>
        <div className="space-y-2.5">
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
                        {PLACEMENT_LABEL[p.placement_type ?? ""] ?? p.placement_type ?? "Not placed yet"} ·{" "}
                        {dest ? (DESTINATION_LABEL[dest.destination_type] ?? dest.destination_type) : "Not set up"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="font-display text-[20px] font-bold tracking-tight">{t?.current ?? 0}</span>
                      <TrendPill changePct={t?.changePct ?? null} size="sm" />
                    </div>
                  </div>
                </GlassPanel>
              </Link>
            );
          })}
        </div>
      </section>

      <GlassPanel className="p-4">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-accent uppercase">What we can prove</p>
        <p className="mt-2 text-[14px] leading-relaxed text-pretty">
          {direct.length === 1
            ? "1 result came straight from a tap"
            : `${direct.length} results came straight from a tap`}{" "}
          — a lead, an offer or a booking we followed all the way through. Reviews and follows moved too, but
          those we can only line up in time.
        </p>
        <Link to="/app/results" className="mt-3 inline-block text-[13px] font-semibold text-primary">
          See the full picture →
        </Link>
      </GlassPanel>
    </div>
  );
}

function Greeting({ name }: { name?: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
        <Zap className="h-[18px] w-[18px]" />
      </span>
      <div>
        <p className="text-[13px] text-muted-foreground">{greeting()}</p>
        <h1 className="mt-0.5 font-display text-[22px] leading-tight font-bold tracking-tight text-balance">
          {name ?? "Your business"}
        </h1>
      </div>
    </div>
  );
}
