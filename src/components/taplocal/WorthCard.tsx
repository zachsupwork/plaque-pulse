import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import {
  impactSummary,
  recordFollowerCount,
  recordValueInputs,
  recordPerformanceMetric,
  recordReviewerReach,
  GBP_METRICS,
  IG_METRICS,
} from "@/lib/impact.functions";

const BADGE_CLS: Record<string, string> = {
  OBSERVED: "bg-primary/10 text-primary",
  EXTERNAL: "bg-accent/15 text-accent",
  INFERRED: "bg-muted text-muted-foreground",
  CONFIRMED: "bg-primary text-primary-foreground",
};

function Badge({ b }: { b: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${BADGE_CLS[b] ?? ""}`}>{b}</span>;
}

/** Shared impact query — Results and WorthCard read the same calculation. */
export function useImpact(businessId: string | null | undefined, days = 30) {
  const fn = useServerFn(impactSummary);
  return useQuery({
    queryKey: ["impact", businessId ?? null, days],
    queryFn: () => fn({ data: { businessId: businessId ?? null, days } }),
    enabled: businessId !== undefined,
  });
}

function Delta({ label, d, fmt = (n: number) => String(n) }: { label: string; d: { previous: number; current: number; updatedInPeriod?: boolean } | null; fmt?: (n: number) => string }) {
  return (
    <p className="text-[13px]">
      <span className="text-muted-foreground">{label}: </span>
      {d ? (
        <span className="font-semibold">
          {fmt(d.previous)} → {fmt(d.current)}
          {d.updatedInPeriod === false ? <span className="ml-1 font-normal text-muted-foreground">(no refresh this period)</span> : null}
        </span>
      ) : (
        <span className="text-muted-foreground">not recorded yet</span>
      )}
    </p>
  );
}

const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));

export function WorthCard({ businessId, days = 30 }: { businessId: string | null; days?: number }) {
  const q = useImpact(businessId, days);
  const [open, setOpen] = useState(false);
  const r = q.data;

  if (q.isLoading) return <GlassPanel className="p-4 text-[13px] text-muted-foreground">Loading impact…</GlassPanel>;
  if (!r || !r.ok)
    return <GlassPanel className="p-4 text-[13px] text-muted-foreground">Impact data unavailable right now.</GlassPanel>;

  const f = r.followers;
  const top = r.reviews.slice(0, 5);
  const ratingChange = r.rating ? r.rating.current - r.rating.previous : null;

  return (
    <GlassPanel tone="brand" className="space-y-4 p-4">
      <div>
        <p className="text-[12px] font-semibold tracking-[0.08em] text-accent uppercase">What could this be worth?</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Last {days} days</p>
      </div>

      <div className="space-y-1 text-[14px]">
        <p><b>{r.reviewTaps.total + r.instagramTaps.total}</b> relevant TapLocal interactions <Badge b="OBSERVED" /></p>
        <p><b>{r.newReviews}</b> new Google reviews <Badge b="EXTERNAL" /></p>
        {ratingChange != null && r.rating ? (
          <p>Rating <b>{r.rating.previous.toFixed(1)} → {r.rating.current.toFixed(1)}</b></p>
        ) : null}
        <p>
          {f.known ? <><b>{sign(f.gained)}</b> Instagram followers</> : <span className="text-muted-foreground">Follower count unavailable</span>}
        </p>
        {r.elevatedReviews ? <p><b>{r.elevatedReviews}</b> high-reach contributor review{r.elevatedReviews > 1 ? "s" : ""}</p> : null}
        {r.photoChanges.length ? <p><b>{r.prominentGains}</b> Google photo prominence gain{r.prominentGains === 1 ? "" : "s"}</p> : null}
        <p className="text-[13px]">
          {businessId == null ? null : r.gbp.connected ? (
            r.gbp.visibilityUp ? "Organic visibility increased after this result — possible contribution, not confirmed." : "No organic visibility increase vs the previous period."
          ) : (
            <span className="text-muted-foreground">Google performance data not connected.</span>
          )}
        </p>
        <p className="text-[13px]">Attribution confidence: <b>{r.confidence}</b></p>
        <p className="pt-1">
          {r.opportunity ? (
            <>
              Estimated opportunity: <b>${r.opportunity.low.toLocaleString()}–${r.opportunity.high.toLocaleString()}</b>
              <span className="ml-1 text-[10px] font-bold tracking-wide text-accent">MODELLED OPPORTUNITY — NOT GUARANTEED REVENUE</span>
            </>
          ) : (
            <span className="text-[13px] text-muted-foreground">Not enough data yet to estimate a reliable dollar value.</span>
          )}
        </p>
      </div>

      {/* Evidence chain */}
      <section className="border-t border-border pt-3">
        <p className="text-[13px] font-bold">Impact timeline</p>
        <ol className="mt-1.5 space-y-1">
          {r.timeline.map((s, i) => (
            <li key={s.stage} className={`flex flex-wrap items-center gap-1.5 text-[12px] ${s.measured ? "" : "text-muted-foreground"}`}>
              <span className="font-semibold">{i + 1}. {s.stage}</span>
              <Badge b={s.badge} />
              <span>— {s.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Google */}
      <section className="space-y-1.5 border-t border-border pt-3">
        <p className="text-[13px] font-bold">Google reviews</p>
        <Delta label="Review count" d={r.reviewCount} />
        <Delta label="Rating" d={r.rating} fmt={(n) => n.toFixed(1)} />
        <p className="text-[13px] text-muted-foreground">
          Review taps: {r.reviewTaps.total} · {r.reviewTaps.nfc} NFC · {r.reviewTaps.qr} QR
        </p>
        {r.newReviews > r.reviews.length ? (
          <p className="text-[12px] text-muted-foreground">
            Google's listing only returns a few recent reviews, so {r.newReviews - r.reviews.length} of the new reviews are known from the count change only.
          </p>
        ) : null}
        {top.map((v) => (
          <div key={v.id} className="rounded-xl border border-border p-2.5 text-[13px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{v.rating != null ? "★".repeat(Math.round(v.rating)) : "Rating n/a"}</span>
              {v.authorUrl ? <a href={v.authorUrl} target="_blank" rel="noreferrer" className="text-primary">{v.author ?? "Reviewer"}</a> : <span>{v.author ?? "Unknown reviewer"}</span>}
              <Badge b={v.badge} />
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${v.reach === "Standard" ? "bg-muted text-muted-foreground" : "bg-accent/15 text-accent"}`}>{v.reach}</span>
            </div>
            {v.gapMinutes != null ? (
              <p className="mt-1 text-muted-foreground">
                {v.tapSource?.toUpperCase()} tap → Google Reviews → review {v.timingExact ? "" : "first seen "}{v.gapMinutes} min later
                {v.competingTaps ? ` · ${v.competingTaps} other review taps nearby` : ""} · {v.confidence}% likely.{" "}
                <b>Possible TapLocal contribution — not confirmed.</b>
                {v.tapEventId && r.admin ? (
                  <> <Link to="/admin/interactions/$eventId" params={{ eventId: v.tapEventId }} className="text-primary">View tap</Link></>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">No TapLocal review tap within 24h before this review.</p>
            )}
            <p className="mt-1 text-[12px] text-muted-foreground">
              Why: {v.reachEvidence.join(", ")}
              {v.reachSource ? ` · ${v.reachSource === "admin_verified" ? "verified by staff" : v.reachSource}` : ""}
              {v.reachCheckedAt ? ` · checked ${new Date(v.reachCheckedAt).toLocaleDateString()}` : ""}.
              {v.reach !== "Standard" ? " Past viewers won't automatically see this review." : ""}
            </p>
            {r.admin ? <ReachForm id={v.id} initial={v.reachValues} url={v.authorUrl} /> : null}
          </div>
        ))}
      </section>

      {/* Photos */}
      {r.photoChanges.length ? (
        <section className="space-y-1 border-t border-border pt-3">
          <p className="text-[13px] font-bold">Google photo prominence</p>
          {r.photoChanges.map((p) => (
            <p key={p.id} className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <b>{p.label}</b> <Badge b={p.badge} />
              <span className="text-muted-foreground">
                {p.contributor ?? "Unknown contributor"} · {new Date(p.at).toLocaleDateString()}
                {p.from ? ` · was ${p.from.replace(/_/g, " ")}` : ""}
              </span>
            </p>
          ))}
          <p className="text-[11px] text-muted-foreground">"Top returned Google photo" is the first photo Google's data returns — only staff/screenshot checks confirm it as the main image.</p>
        </section>
      ) : null}

      {/* Google performance */}
      {businessId ? (
        <section className="space-y-1 border-t border-border pt-3">
          <p className="text-[13px] font-bold">Google Business performance</p>
          {r.gbp.connected ? (
            r.gbp.metrics.map((m) => (
              <p key={m.metric} className="text-[13px]">
                <span className="text-muted-foreground">{m.label}: </span>
                <b>{m.hasBefore ? `${m.before.toLocaleString()} → ` : ""}{m.after.toLocaleString()}</b> <Badge b="EXTERNAL" />
              </p>
            ))
          ) : (
            <p className="text-[13px] text-muted-foreground">Google performance data not connected.</p>
          )}
          <p className="text-[11px] text-muted-foreground">Previous {days} days → last {days} days. Changes after a result are a possible contribution, not confirmed.</p>
        </section>
      ) : null}

      {/* Instagram */}
      <section className="space-y-1.5 border-t border-border pt-3">
        <p className="text-[13px] font-bold">Instagram</p>
        {f.delta ? (
          <p className="text-[13px]">
            <b>{f.delta.previous.toLocaleString()} → {f.delta.current.toLocaleString()}</b> ({sign(f.gained)} followers) <Badge b="EXTERNAL" />
          </p>
        ) : !f.known ? (
          <p className="text-[13px] text-muted-foreground">Follower count unavailable</p>
        ) : null}
        {r.instagramInsights.map((m) => (
          <p key={m.metric} className="text-[13px]">
            <span className="text-muted-foreground">{m.label}: </span>
            <b>{m.hasBefore ? `${m.before.toLocaleString()} → ` : ""}{m.after.toLocaleString()}</b> <Badge b="EXTERNAL" />
          </p>
        ))}
        <p className="text-[13px] text-muted-foreground">
          {r.instagramTaps.total} Instagram taps · {r.instagramTaps.nfc} NFC · {r.instagramTaps.qr} QR
        </p>
        {f.known && r.instagramTaps.total > 0 ? (
          <p className="text-[13px] font-semibold">Possible TapLocal contribution — not confirmed <Badge b="INFERRED" /></p>
        ) : null}
      </section>

      <button type="button" onClick={() => setOpen((o) => !o)} className="text-[13px] font-semibold text-primary">
        {open ? "Hide" : "How was this calculated?"}
      </button>
      {open ? (
        <div className="space-y-1 text-[12px] text-muted-foreground">
          <p><b>Actual results</b>: taps from TapLocal's interaction feed; review count and rating from saved Google listing refreshes (the same numbers everywhere in TapLocal); follower and performance numbers from connected accounts or staff entry from the official reports.</p>
          <p>A review is linked to a tap only if a Google Reviews tap at the same business happened within 24 hours before it. Confidence falls with a longer gap and with competing taps. This is correlation, never confirmed causation.</p>
          <p>Contributor reach: High = Local Guide 8+, 500+ reviews, or 100,000+ photo views. Elevated = level 5+, 100+ reviews, 100+ photos, or 10,000+ views. Only stored evidence counts.</p>
          {r.opportunity ? (
            <ul className="list-disc pl-4">{r.opportunity.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          ) : (
            <p>A dollar estimate needs at least 10 relevant taps plus this business's own average transaction value and conversion rate. No fixed value per review, follower or Local Guide level is used.</p>
          )}
          <p><b>Research benchmarks</b> are not used in these numbers.</p>
        </div>
      ) : null}

      {r.admin && businessId ? <AdminInputs businessId={businessId} /> : null}
    </GlassPanel>
  );
}

function ReachForm({ id, initial, url }: { id: string; initial: { guide: number; reviews: number; photos: number; views: number }; url: string | null }) {
  const qc = useQueryClient();
  const save = useServerFn(recordReviewerReach);
  const [show, setShow] = useState(false);
  const [v, setV] = useState({
    guide: initial.guide ? String(initial.guide) : "",
    reviews: initial.reviews ? String(initial.reviews) : "",
    photos: initial.photos ? String(initial.photos) : "",
    views: initial.views ? String(initial.views) : "",
    url: url ?? "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  if (!show)
    return <button type="button" className="mt-1 text-[12px] font-semibold text-primary" onClick={() => setShow(true)}>Record verified reach</button>;
  const n = (s: string) => (s.trim() ? parseInt(s.replace(/[,\s]/g, ""), 10) : null);
  const input = "w-24 rounded-lg border border-border bg-background px-2 py-1 text-[12px]";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
      <input className={input} placeholder="Guide level" value={v.guide} onChange={(e) => setV({ ...v, guide: e.target.value })} />
      <input className={input} placeholder="Reviews" value={v.reviews} onChange={(e) => setV({ ...v, reviews: e.target.value })} />
      <input className={input} placeholder="Photos" value={v.photos} onChange={(e) => setV({ ...v, photos: e.target.value })} />
      <input className={input} placeholder="Photo views" value={v.views} onChange={(e) => setV({ ...v, views: e.target.value })} />
      <input className="w-48 rounded-lg border border-border bg-background px-2 py-1 text-[12px]" placeholder="Profile URL" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} />
      <button type="button" className="rounded-lg bg-primary px-2.5 py-1 font-semibold text-primary-foreground" onClick={async () => {
        const res = await save({ data: { observationId: id, localGuideLevel: n(v.guide), reviewCount: n(v.reviews), photoCount: n(v.photos), photoViews: n(v.views), profileUrl: v.url.trim() || null } }).catch(() => ({ ok: false as const, error: "Check the numbers and URL" }));
        setMsg(res.ok ? "Saved" : res.error);
        if (res.ok) void qc.invalidateQueries({ queryKey: ["impact"] });
      }}>Save</button>
      {msg ? <span>{msg}</span> : null}
    </div>
  );
}

function AdminInputs({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const saveF = useServerFn(recordFollowerCount);
  const saveV = useServerFn(recordValueInputs);
  const saveP = useServerFn(recordPerformanceMetric);
  const [followers, setFollowers] = useState("");
  const [atv, setAtv] = useState("");
  const [conv, setConv] = useState("");
  const [clv, setClv] = useState("");
  const [metric, setMetric] = useState(Object.keys(GBP_METRICS)[0]!);
  const [mVal, setMVal] = useState("");
  const [mDate, setMDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState<string | null>(null);
  const done = (ok: boolean, e?: string) => {
    setMsg(ok ? "Saved" : (e ?? "Failed"));
    if (ok) void qc.invalidateQueries({ queryKey: ["impact"] });
  };
  const input = "w-28 rounded-lg border border-border bg-background px-2 py-1 text-[13px]";
  const btn = "rounded-lg bg-primary px-2.5 py-1 font-semibold text-primary-foreground";
  return (
    <div className="space-y-2 border-t border-border pt-3 text-[12px]">
      <p className="font-semibold">Admin inputs</p>
      <div className="flex flex-wrap items-center gap-2">
        <input className={input} inputMode="numeric" placeholder="Followers now" value={followers} onChange={(e) => setFollowers(e.target.value)} />
        <button type="button" className={btn} onClick={async () => {
          const n = parseInt(followers, 10);
          if (Number.isNaN(n)) return setMsg("Enter a number");
          const res = await saveF({ data: { businessId, followers: n, source: "manual" } });
          done(res.ok, res.ok ? undefined : res.error);
        }}>Record Instagram count</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-lg border border-border bg-background px-2 py-1 text-[13px]" value={metric} onChange={(e) => setMetric(e.target.value)}>
          <optgroup label="Google Business Profile">{Object.entries(GBP_METRICS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
          <optgroup label="Instagram insights">{Object.entries(IG_METRICS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
        </select>
        <input className={input} type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} />
        <input className={input} inputMode="numeric" placeholder="Daily value" value={mVal} onChange={(e) => setMVal(e.target.value)} />
        <button type="button" className={btn} onClick={async () => {
          const n = parseFloat(mVal);
          if (!(n >= 0)) return setMsg("Enter a number");
          const res = await saveP({ data: { businessId, metric, value: n, date: mDate } });
          done(res.ok, res.ok ? undefined : res.error);
        }}>Record daily metric</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className={input} inputMode="decimal" placeholder="Avg sale $" value={atv} onChange={(e) => setAtv(e.target.value)} />
        <input className={input} inputMode="decimal" placeholder="Conversion %" value={conv} onChange={(e) => setConv(e.target.value)} />
        <input className={input} inputMode="decimal" placeholder="Lifetime value $" value={clv} onChange={(e) => setClv(e.target.value)} />
        <button type="button" className={btn} onClick={async () => {
          const a = parseFloat(atv), c = parseFloat(conv) / 100, l = parseFloat(clv);
          if (!(a > 0) || !(c > 0 && c <= 1)) return setMsg("Enter a sale value and a % between 0 and 100");
          const res = await saveV({ data: { businessId, avgTransactionValue: a, conversionRate: c, customerLifetimeValue: l > 0 ? l : null } });
          done(res.ok, res.ok ? undefined : res.error);
        }}>Save business values</button>
      </div>
      <p className="text-muted-foreground">Enter numbers read from Google Business Profile, Instagram/Meta or the business only — never estimates.</p>
      {msg ? <p>{msg}</p> : null}
    </div>
  );
}
