import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import { impactSummary, recordFollowerCount, recordValueInputs } from "@/lib/impact.functions";

const FLYWHEEL: { label: string; measured: boolean }[] = [
  { label: "Tap/Scan", measured: true },
  { label: "Review/Follow", measured: true },
  { label: "Stronger digital presence", measured: false },
  { label: "More organic visibility opportunity", measured: false },
  { label: "Discovery", measured: false },
  { label: "Calls/visits/bookings/sales", measured: false },
  { label: "More customers", measured: false },
  { label: "More reviews/followers", measured: false },
];

const BADGE_CLS: Record<string, string> = {
  OBSERVED: "bg-primary/10 text-primary",
  EXTERNAL: "bg-accent/15 text-accent",
  INFERRED: "bg-muted text-muted-foreground",
  CONFIRMED: "bg-primary text-primary-foreground",
};

function Badge({ b }: { b: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${BADGE_CLS[b] ?? ""}`}>{b}</span>;
}

function Delta({ label, d, fmt = (n: number) => String(n) }: { label: string; d: { previous: number; current: number } | null; fmt?: (n: number) => string }) {
  return (
    <p className="text-[13px]">
      <span className="text-muted-foreground">{label}: </span>
      {d ? (
        <span className="font-semibold">
          {fmt(d.previous)} → {fmt(d.current)}
        </span>
      ) : (
        <span className="text-muted-foreground">not recorded in this period</span>
      )}
    </p>
  );
}

export function WorthCard({ businessId, days = 30 }: { businessId: string | null; days?: number }) {
  const fn = useServerFn(impactSummary);
  const q = useQuery({
    queryKey: ["impact", businessId, days],
    queryFn: () => fn({ data: { businessId, days } }),
    enabled: businessId !== undefined,
  });
  const [open, setOpen] = useState(false);
  const r = q.data;

  if (q.isLoading) return <GlassPanel className="p-4 text-[13px] text-muted-foreground">Loading impact…</GlassPanel>;
  if (!r || !r.ok)
    return <GlassPanel className="p-4 text-[13px] text-muted-foreground">Impact data unavailable right now.</GlassPanel>;

  const f = r.followers;
  const top = r.reviews.slice(0, 5);

  return (
    <GlassPanel tone="brand" className="space-y-4 p-4">
      <div>
        <p className="text-[12px] font-semibold tracking-[0.08em] text-accent uppercase">What could this be worth?</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Last {days} days</p>
      </div>

      <div className="space-y-1 text-[14px]">
        <p><b>{r.reviewTaps.total + r.instagramTaps.total}</b> relevant TapLocal interactions <Badge b="OBSERVED" /></p>
        <p><b>{r.reviews.length}</b> new Google reviews detected <Badge b="EXTERNAL" /></p>
        <p>
          {f.known ? (
            <><b>{f.gained >= 0 ? `+${f.gained}` : f.gained}</b> Instagram followers</>
          ) : (
            <span className="text-muted-foreground">Follower count unavailable</span>
          )}
        </p>
        {r.elevatedReviews ? <p><b>{r.elevatedReviews}</b> elevated-amplification review{r.elevatedReviews > 1 ? "s" : ""}</p> : null}
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
        <p className="text-[13px]">Confidence: <b>{r.confidence}</b></p>
      </div>

      {/* Google */}
      <section className="space-y-1.5 border-t border-border pt-3">
        <p className="text-[13px] font-bold">Google reviews — potential business impact</p>
        <Delta label="Review count" d={r.reviewCount} />
        <Delta label="Rating" d={r.rating} fmt={(n) => n.toFixed(1)} />
        <p className="text-[13px] text-muted-foreground">
          Review taps: {r.reviewTaps.total} · {r.reviewTaps.nfc} NFC · {r.reviewTaps.qr} QR
        </p>
        {top.map((v) => (
          <div key={v.id} className="rounded-xl border border-border p-2.5 text-[13px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{v.rating != null ? "★".repeat(Math.round(v.rating)) : "Rating n/a"}</span>
              <span>{v.author ?? "Unknown reviewer"}</span>
              <Badge b={v.badge} />
              {v.reach !== "Standard" ? (
                <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">High-reach reviewer / {v.reach.toLowerCase()}</span>
              ) : null}
            </div>
            {v.gapMinutes != null ? (
              <p className="mt-1 text-muted-foreground">
                {v.tapSource?.toUpperCase()} tap → Google Reviews → review {v.timingExact ? "" : "first seen "}{v.gapMinutes} min later
                {v.competingTaps ? ` · ${v.competingTaps} other review taps nearby` : ""} · {v.confidence}% likely.{" "}
                <b>Possible TapLocal contribution — not confirmed.</b>
                {v.tapEventId ? (
                  <> <Link to="/admin/interactions/$eventId" params={{ eventId: v.tapEventId }} className="text-primary">View tap</Link></>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">No TapLocal review tap within 24h before this review.</p>
            )}
            {v.reach !== "Standard" ? <p className="mt-1 text-[12px] text-muted-foreground">Evidence: {v.reachEvidence.join(", ")}. This does not mean their past viewers will see this review.</p> : null}
          </div>
        ))}
        <p className="text-[12px] text-muted-foreground">
          Why it matters: more reviews strengthen social proof and may support Google local prominence, which could lead to more
          searches, calls, directions and visits. Rankings are never guaranteed.
        </p>
      </section>

      {/* Instagram */}
      <section className="space-y-1.5 border-t border-border pt-3">
        <p className="text-[13px] font-bold">Instagram followers — potential business impact</p>
        {f.delta ? (
          <p className="text-[13px]">
            <b>{f.delta.previous.toLocaleString()} → {f.delta.current.toLocaleString()}</b> ({f.gained >= 0 ? "+" : ""}{f.gained} followers) <Badge b="EXTERNAL" />
          </p>
        ) : !f.known ? (
          <p className="text-[13px] text-muted-foreground">Follower count unavailable</p>
        ) : null}
        <p className="text-[13px] text-muted-foreground">
          {r.instagramTaps.total} Instagram taps · {r.instagramTaps.nfc} NFC · {r.instagramTaps.qr} QR
        </p>
        {f.known && r.instagramTaps.total > 0 ? (
          <p className="text-[13px] font-semibold">Possible TapLocal contribution — not confirmed <Badge b="INFERRED" /></p>
        ) : null}
        <p className="text-[12px] text-muted-foreground">
          Amplification: Standard — no evidence of followers posting, tagging or sharing with measurable reach. Why it matters: a
          larger retained audience may bring future reach, profile visits and customers. Feed/Explore placement is never guaranteed.
        </p>
      </section>

      {/* Flywheel */}
      <section className="border-t border-border pt-3">
        <p className="text-[13px] font-bold">Organic flywheel</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
          {FLYWHEEL.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1">
              <span className={`rounded-full border px-2 py-0.5 ${s.measured ? "border-primary/40 font-semibold" : "border-dashed border-border text-muted-foreground"}`}>
                {s.label}{s.measured ? "" : " (potential)"}
              </span>
              {i < FLYWHEEL.length - 1 ? <span className="text-muted-foreground">→</span> : null}
            </span>
          ))}
        </div>
      </section>

      <button type="button" onClick={() => setOpen((o) => !o)} className="text-[13px] font-semibold text-primary">
        {open ? "Hide" : "How was this calculated?"}
      </button>
      {open ? (
        <div className="space-y-1 text-[12px] text-muted-foreground">
          <p><b>Actual results</b> (this business): taps from TapLocal's interaction feed; reviews from the public Google listing; follower counts from Meta data or staff entry.</p>
          <p>A review is linked to a tap only if a Google Reviews tap at the same business happened within 24 hours before it. Confidence falls with a longer gap and with competing taps. This is correlation, never confirmed causation.</p>
          <p>Reviewer reach uses recorded public contribution counts or Local Guide level only.</p>
          {r.opportunity ? (
            <ul className="list-disc pl-4">{r.opportunity.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          ) : (
            <p>A dollar estimate needs at least 10 relevant taps plus this business's own average transaction value and conversion rate. No universal value per review or follower is used.</p>
          )}
          <p><b>Research benchmarks</b> are not used in these numbers.</p>
        </div>
      ) : null}

      {r.admin && businessId ? <AdminInputs businessId={businessId} /> : null}
    </GlassPanel>
  );
}

function AdminInputs({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const saveF = useServerFn(recordFollowerCount);
  const saveV = useServerFn(recordValueInputs);
  const [followers, setFollowers] = useState("");
  const [atv, setAtv] = useState("");
  const [conv, setConv] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const done = (ok: boolean, e?: string) => {
    setMsg(ok ? "Saved" : (e ?? "Failed"));
    if (ok) void qc.invalidateQueries({ queryKey: ["impact"] });
  };
  const input = "w-28 rounded-lg border border-border bg-background px-2 py-1 text-[13px]";
  return (
    <div className="space-y-2 border-t border-border pt-3 text-[12px]">
      <p className="font-semibold">Admin inputs</p>
      <div className="flex flex-wrap items-center gap-2">
        <input className={input} inputMode="numeric" placeholder="Followers now" value={followers} onChange={(e) => setFollowers(e.target.value)} />
        <button type="button" className="rounded-lg bg-primary px-2.5 py-1 font-semibold text-primary-foreground" onClick={async () => {
          const n = parseInt(followers, 10);
          if (Number.isNaN(n)) return setMsg("Enter a number");
          const res = await saveF({ data: { businessId, followers: n, source: "manual" } });
          done(res.ok, res.ok ? undefined : res.error);
        }}>Record Instagram count</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className={input} inputMode="decimal" placeholder="Avg sale $" value={atv} onChange={(e) => setAtv(e.target.value)} />
        <input className={input} inputMode="decimal" placeholder="Conversion %" value={conv} onChange={(e) => setConv(e.target.value)} />
        <button type="button" className="rounded-lg bg-primary px-2.5 py-1 font-semibold text-primary-foreground" onClick={async () => {
          const a = parseFloat(atv), c = parseFloat(conv) / 100;
          if (!(a > 0) || !(c > 0 && c <= 1)) return setMsg("Enter a sale value and a % between 0 and 100");
          const res = await saveV({ data: { businessId, avgTransactionValue: a, conversionRate: c } });
          done(res.ok, res.ok ? undefined : res.error);
        }}>Save business values</button>
      </div>
      <p className="text-muted-foreground">Enter counts read from Instagram/Meta only — never estimates.</p>
      {msg ? <p>{msg}</p> : null}
    </div>
  );
}
