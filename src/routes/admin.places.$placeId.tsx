import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, StatusChip } from "@/components/taplocal/Field";
import { CopyButton } from "@/components/taplocal/LinkTools";
import { PlaqueManageCard } from "@/components/taplocal/PlaqueManageCard";
import { getPlaceDetail } from "@/lib/places.functions";
import { PLACEMENT_LABEL } from "@/lib/taplocal";

export const Route = createFileRoute("/admin/places/$placeId")({
  head: () => ({
    meta: [
      { title: "Place management — TapLocal admin" },
      { name: "description", content: "Plaques, SmartLinks, destinations, programming and results for one place." },
      { property: "og:title", content: "Place management — TapLocal admin" },
      { property: "og:description", content: "Plaques, SmartLinks, destinations, programming and results for one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlaceDetail,
});

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

const TABS = ["plaques", "results", "activity", "access", "records"] as const;

function PlaceDetail() {
  const { placeId } = Route.useParams();
  const detailFn = useServerFn(getPlaceDetail);
  const [tab, setTab] = useState<(typeof TABS)[number]>("plaques");
  const [onlyAttention, setOnlyAttention] = useState(false);

  const detail = useQuery({
    queryKey: ["place-detail", placeId],
    queryFn: () => detailFn({ data: { placeId } }),
    refetchInterval: 20_000,
  });

  const data = detail.data?.ok ? detail.data : null;
  const place = data?.place ?? null;

  if (detail.isLoading) return <p className="text-[13px] text-muted-foreground">Loading place…</p>;

  if (!place) {
    return (
      <GlassPanel className="p-6 text-center">
        <p className="text-[13px] text-muted-foreground">That place no longer exists.</p>
        <Link to="/admin/places" className="mt-3 inline-block rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground">
          Back to Places
        </Link>
      </GlassPanel>
    );
  }

  const plaques = onlyAttention ? place.plaques.filter((p) => p.attention.length > 0) : place.plaques;
  const placeTitle = place.multiLocation ? `${place.businessName} — ${place.locationName}` : place.businessName;

  return (
    <div className="space-y-4">
      <Link to="/admin/places" className="inline-block text-[12px] font-semibold text-muted-foreground">
        ← All places
      </Link>

      <GlassPanel className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-[22px] font-bold tracking-tight">{place.businessName}</h1>
            <p className="truncate text-[13px] text-muted-foreground">
              {[place.multiLocation ? place.locationName : null, place.address, place.city, place.province]
                .filter(Boolean)
                .join(" · ") || "No address on file"}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {place.industry?.replace(/_/g, " ")}
              {place.googleCategory ? ` · ${place.googleCategory.replace(/_/g, " ")}` : ""}
            </p>
          </div>
          <StatusChip tone={place.attentionCount ? "attention" : place.activePlaqueCount ? "ok" : "idle"}>
            {place.attentionCount ? `${place.attentionCount} to fix` : place.activePlaqueCount ? "Live" : "Not live"}
          </StatusChip>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {place.googleRating ? (
            <Pill>★ {place.googleRating} · {place.googleReviews ?? 0} Google reviews</Pill>
          ) : (
            <Pill muted>No Google listing linked</Pill>
          )}
          {place.instagramUsername ? <Pill>@{place.instagramUsername}</Pill> : <Pill muted>No Instagram linked</Pill>}
          {place.phone ? <Pill>{place.phone}</Pill> : null}
          {place.ownerClaimed ? <Pill>{place.memberCount} owner account(s)</Pill> : <Pill muted>No owner access</Pill>}
          {place.batches.map((b) => (
            <Pill key={b}>Batch {b}</Pill>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Link
            to="/admin/provisioning"
            search={{ businessId: place.businessId, ...(place.locationId ? { locationId: place.locationId } : {}) }}
            className="rounded-xl bg-primary py-2.5 text-center text-[12px] font-bold text-primary-foreground"
          >
            + Add new plaque
          </Link>
          <Link
            to="/admin/assign"
            search={{ businessId: place.businessId, ...(place.locationId ? { locationId: place.locationId } : {}) }}
            className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold"
          >
            Assign existing
          </Link>
          <Link
            to="/admin/setup"
            search={{ businessId: place.businessId, placeId: place.key, ...(place.locationId ? { locationId: place.locationId } : {}) }}
            className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold"
          >
            Set up plaque
          </Link>
          <Link
            to="/admin/businesses/$id"
            params={{ id: place.businessId }}
            className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold"
          >
            Business record
          </Link>

          {place.googleMapsUri ? (
            <a href={place.googleMapsUri} target="_blank" rel="noreferrer" className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold">
              Google listing
            </a>
          ) : null}
          {place.website ? (
            <a href={place.website} target="_blank" rel="noreferrer" className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold">
              Website
            </a>
          ) : null}
        </div>
      </GlassPanel>

      {data?.duplicates.length ? (
        <GlassPanel className="border-amber-500/40 p-4">
          <p className="text-[12px] font-bold">Possible duplicate place</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {data.duplicates.some((d) => d.strong)
              ? "Another place shares this exact Google listing."
              : "Another place has the same name in the same city."}
          </p>
          <div className="mt-2 space-y-1.5">
            {data.duplicates.map((d) => (
              <Link
                key={d.key}
                to="/admin/places/$placeId"
                params={{ placeId: d.key }}
                className="block rounded-xl border border-border px-3 py-2 text-[12px] font-semibold"
              >
                {d.businessName} · {[d.address, d.city].filter(Boolean).join(", ") || "no address"} · {d.plaqueCount} plaques
              </Link>
            ))}
          </div>
        </GlassPanel>
      ) : null}

      {place.siblingLocations.length ? (
        <GlassPanel className="p-4">
          <SectionTitle>Other locations for this business</SectionTitle>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {place.siblingLocations.map((s) => (
              <Link
                key={s.key}
                to="/admin/places/$placeId"
                params={{ placeId: s.key }}
                className="rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold"
              >
                {s.name} · {s.plaqueCount} plaques
              </Link>
            ))}
          </div>
        </GlassPanel>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Today" value={place.analytics.today} />
        <Metric label="Last 7 days" value={place.analytics.days7} />
        <Metric label="Last 30 days" value={place.analytics.days30} />
        <Metric label="All time" value={place.analytics.allTime} sub={`NFC ${place.analytics.nfc} · QR ${place.analytics.qr}`} />
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-bold capitalize ${
              tab === t ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "plaques" ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] text-muted-foreground">
              {place.plaqueCount} plaques · {place.activePlaqueCount} active
            </p>
            <button
              type="button"
              onClick={() => setOnlyAttention((v) => !v)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                onlyAttention ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              Needs attention only
            </button>
          </div>
          {plaques.length === 0 ? (
            <GlassPanel className="p-6 text-center">
              <p className="text-[13px] text-muted-foreground">No plaques here yet.</p>
              <Link
                to="/admin/setup"
                search={{ businessId: place.businessId, placeId: place.key }}
                className="mt-3 inline-block rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground"
              >
                Set one up
              </Link>
            </GlassPanel>
          ) : null}
          {plaques.map((p) => (
            <PlaqueManageCard key={p.id} plaque={p} placeTitle={placeTitle} highlight={p.attention.length > 0} />
          ))}
        </div>
      ) : null}

      {tab === "results" ? (
        <GlassPanel className="p-4">
          <SectionTitle>Which plaque earns its place</SectionTitle>
          <div className="mt-3 space-y-2">
            {place.analytics.perPlaque.map((p) => (
              <div key={p.id}>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-semibold">
                    {p.plaqueCode}
                    {p.placement ? ` · ${PLACEMENT_LABEL[p.placement] ?? p.placement}` : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {p.allTime} taps · {p.share}%
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-foreground/8">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${p.share}%` }} />
                </div>
              </div>
            ))}
            {place.analytics.perPlaque.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No taps recorded yet.</p>
            ) : null}
          </div>
        </GlassPanel>
      ) : null}

      {tab === "activity" ? (
        <GlassPanel className="p-4">
          <SectionTitle>Recent activity</SectionTitle>
          <div className="mt-3 space-y-1.5">
            {(data?.activity ?? []).map((a, i) => (
              <div key={`${a.at}-${i}`} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold capitalize">{a.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {[a.plaqueCode, a.placement ? (PLACEMENT_LABEL[a.placement] ?? a.placement) : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">{ago(a.at)}</span>
              </div>
            ))}
            {(data?.activity ?? []).length === 0 ? <p className="text-[13px] text-muted-foreground">Nothing yet.</p> : null}
          </div>
        </GlassPanel>
      ) : null}

      {tab === "access" ? (
        <GlassPanel className="p-4">
          <SectionTitle>Who can see this place's portal</SectionTitle>
          <div className="mt-3 space-y-1.5">
            {(data?.owners ?? []).map((o) => (
              <div key={o.userId} className="rounded-xl border border-border px-3 py-2">
                <p className="text-[12px] font-semibold">{o.name || o.email || o.userId}</p>
                <p className="text-[11px] capitalize text-muted-foreground">
                  {o.role} · joined {new Date(o.joinedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
            {(data?.owners ?? []).length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Nobody at this business has portal access yet. They get it by activating a plaque.
              </p>
            ) : null}
          </div>
        </GlassPanel>
      ) : null}

      {tab === "records" ? (
        <GlassPanel className="p-4">
          <SectionTitle>Reference</SectionTitle>
          <div className="mt-3 space-y-1.5 text-[12px]">
            <Row label="Place ID" value={place.key} />
            <Row label="Business ID" value={place.businessId} />
            {place.locationId ? <Row label="Location ID" value={place.locationId} /> : null}
            {place.googlePlaceId ? <Row label="Google Place ID" value={place.googlePlaceId} /> : null}
            {place.googleReviewUrl ? <Row label="Review link" value={place.googleReviewUrl} /> : null}
            {place.instagramUrl ? <Row label="Instagram" value={place.instagramUrl} /> : null}
            {place.batches.length ? <Row label="Batches" value={place.batches.join(", ")} /> : null}
          </div>
        </GlassPanel>
      ) : null}
    </div>
  );
}

function Pill({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 ${muted ? "border-border text-muted-foreground" : "border-primary/30 bg-primary/8 text-primary"}`}>
      {children}
    </span>
  );
}

function Metric({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-[22px] font-bold tracking-tight">{value}</p>
      {sub ? <p className="text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right font-mono text-[11px]">{value}</span>
      <CopyButton value={value} />
    </div>
  );
}
