import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, StatusChip } from "@/components/taplocal/Field";
import { listPlaces, placesOverview } from "@/lib/places.functions";

export const Route = createFileRoute("/admin/places/")({
  head: () => ({
    meta: [
      { title: "Places — TapLocal admin" },
      { name: "description", content: "Every place running TapLocal plaques, with links, destinations and live taps." },
      { property: "og:title", content: "Places — TapLocal admin" },
      { property: "og:description", content: "Every place running TapLocal plaques, with links, destinations and live taps." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlacesCentre,
});

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active installations" },
  { key: "needs_attention", label: "Needs attention" },
  { key: "needs_setup", label: "Needs setup" },
  { key: "needs_programming", label: "Not programmed" },
  { key: "needs_verification", label: "Unverified" },
  { key: "no_destination", label: "No destination" },
  { key: "no_placement", label: "No placement" },
  { key: "unclaimed", label: "No owner access" },
  { key: "paused", label: "Paused" },
  { key: "faulty", label: "Faulty" },
];

const SORTS: { key: string; label: string }[] = [
  { key: "recent", label: "Recent activity" },
  { key: "attention_first", label: "Attention first" },
  { key: "most_interactions", label: "Most taps" },
  { key: "most_plaques", label: "Most plaques" },
  { key: "name", label: "Name" },
  { key: "recently_installed", label: "Recently installed" },
  { key: "batch", label: "Batch" },
];

function ago(iso: string | null) {
  if (!iso) return "no taps yet";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function PlacesCentre() {
  const listFn = useServerFn(listPlaces);
  const overviewFn = useServerFn(placesOverview);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [city, setCity] = useState("");

  const overview = useQuery({ queryKey: ["places-overview"], queryFn: () => overviewFn({ data: undefined }), refetchInterval: 15_000 });
  const list = useQuery({
    queryKey: ["places", query, filter, sort, city],
    queryFn: () => listFn({ data: { query, filter, sort, city, batch: "", destination: "", limit: 60 } }),
  });

  const o = overview.data?.ok ? overview.data : null;
  const rows = list.data?.ok ? list.data.places : [];
  const cities = list.data?.ok ? list.data.cities : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold tracking-tight">Places</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {list.data?.ok ? `${list.data.total} places` : "Loading…"} · every location running TapLocal
          </p>
        </div>
        <Link to="/admin/setup" className="rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground">
          Add a place
        </Link>
      </div>

      <div className="sticky top-0 z-20 -mx-1 bg-background/85 px-1 py-2 backdrop-blur">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search place, address, plaque ID, slug, SmartLink, batch, destination, Instagram…"
          className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[14px] outline-none focus:border-primary/60"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card label="Active places" value={o ? String(o.activePlaces) : "—"} sub={o ? `${o.placesWithPlaques} with plaques` : ""} />
        <Card label="Active plaques" value={o ? String(o.activePlaques) : "—"} sub={o ? `${o.totalPlaques} total` : ""} />
        <Card label="Needs attention" value={o ? String(o.needsAttention) : "—"} sub="plaques" tone={o && o.needsAttention > 0 ? "attention" : "ok"} />
        <Card label="No owner access" value={o ? String(o.unclaimedOwners) : "—"} sub="places" />
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
              filter === f.key ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-[12px] font-semibold outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              Sort: {s.label}
            </option>
          ))}
        </select>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-[12px] font-semibold outline-none"
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {list.isLoading ? <p className="text-[13px] text-muted-foreground">Loading places…</p> : null}
      {!list.isLoading && rows.length === 0 ? (
        <GlassPanel className="p-6 text-center">
          <p className="text-[13px] text-muted-foreground">No places match that search.</p>
          <Link to="/admin/setup" className="mt-3 inline-block rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground">
            Set up a new place
          </Link>
        </GlassPanel>
      ) : null}

      <div className="space-y-2.5">
        {rows.map((p) => (
          <GlassPanel key={p.key} className="p-4">
            <Link to="/admin/places/$placeId" params={{ placeId: p.key }} className="block">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-[16px] font-bold tracking-tight">{p.businessName}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {[p.multiLocation ? p.locationName : null, p.address, p.city].filter(Boolean).join(" · ") || "No address on file"}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {p.googleRating ? `★ ${p.googleRating} (${p.googleReviews ?? 0})` : "No Google listing"}
                    {p.instagramUsername ? ` · @${p.instagramUsername}` : ""}
                    {p.ownerClaimed ? " · owner has access" : " · no owner access"}
                  </p>
                </div>
                <div className="shrink-0 space-y-1 text-right">
                  <StatusChip tone={p.attentionCount ? "attention" : p.activePlaqueCount ? "ok" : "idle"}>
                    {p.attentionCount ? `${p.attentionCount} to fix` : p.activePlaqueCount ? "Live" : "Not live"}
                  </StatusChip>
                  <p className="text-[11px] font-semibold">{p.days30} taps / 30d</p>
                  <p className="text-[10px] text-muted-foreground">
                    NFC {p.nfc30} · QR {p.qr30}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{ago(p.lastInteraction)}</p>
                </div>
              </div>
            </Link>

            <div className="mt-2.5 flex flex-wrap gap-1">
              {p.plaques.slice(0, 6).map((q) => (
                <span
                  key={q.id}
                  className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                    q.attention.length ? "border-amber-500/40 text-amber-700 dark:text-amber-400" : "border-border text-muted-foreground"
                  }`}
                >
                  {q.plaqueCode}
                </span>
              ))}
              {p.plaqueCount > 6 ? <span className="text-[10px] text-muted-foreground">+{p.plaqueCount - 6} more</span> : null}
              {p.plaqueCount === 0 ? <span className="text-[10px] text-muted-foreground">No plaques installed yet</span> : null}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <Link
                to="/admin/places/$placeId"
                params={{ placeId: p.key }}
                className="rounded-lg bg-primary py-2 text-center text-[12px] font-bold text-primary-foreground"
              >
                Manage
              </Link>
              <Link
                to="/admin/setup"
                search={{ businessId: p.businessId }}
                className="rounded-lg border border-border py-2 text-center text-[12px] font-bold"
              >
                Add plaque
              </Link>
              <Link
                to="/admin/businesses/$id"
                params={{ id: p.businessId }}
                className="rounded-lg border border-border py-2 text-center text-[12px] font-bold"
              >
                Business
              </Link>
            </div>
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "attention" }) {
  return (
    <div className={`rounded-2xl border p-3 ${tone === "attention" ? "border-amber-500/40 bg-amber-500/[0.05]" : "border-border bg-card/70"}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-[22px] font-bold tracking-tight">{value}</p>
      {sub ? <p className="text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
