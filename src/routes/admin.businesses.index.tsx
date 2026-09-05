import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, StatusChip } from "@/components/taplocal/Field";
import { listAllBusinesses } from "@/lib/admin-data.functions";

export const Route = createFileRoute("/admin/businesses/")({
  head: () => ({
    meta: [
      { title: "Business directory — TapLocal admin" },
      { name: "description", content: "Search every business on the TapLocal network." },
      { property: "og:title", content: "Business directory — TapLocal admin" },
      { property: "og:description", content: "Search every business on the TapLocal network." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BusinessDirectory,
});

const FILTERS = [
  ["all", "All"],
  ["active", "Active"],
  ["unclaimed", "Configured, unclaimed"],
  ["no_owner", "No owner"],
  ["has_plaques", "Has plaques"],
  ["no_plaques", "No plaques"],
  ["recent", "Recent"],
] as const;

function BusinessDirectory() {
  const listFn = useServerFn(listAllBusinesses);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");

  const list = useQuery({
    queryKey: ["admin-businesses", query, filter],
    queryFn: () => listFn({ data: { query, filter } }),
  });

  const rows = list.data?.ok ? list.data.businesses : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Businesses</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Every business on the TapLocal network.</p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name, address, city, phone or Google Place ID"
        className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[14px] outline-none focus:border-primary/60"
      />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
              filter === value ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.isLoading ? <p className="text-[13px] text-muted-foreground">Loading…</p> : null}
      {!list.isLoading && rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No businesses match that.</p>
      ) : null}

      <div className="space-y-2.5">
        {rows.map((b) => (
          <Link key={b.id} to="/admin/businesses/$id" params={{ id: b.id }} className="block">
            <GlassPanel className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-[16px] font-bold tracking-tight">{b.name}</p>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {[b.industry, b.location?.name, b.location?.city].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {b.isDemo ? <StatusChip tone="brand">DEMO</StatusChip> : <StatusChip tone="idle">REAL</StatusChip>}
                  {b.memberCount === 0 ? <StatusChip tone="attention">Admin managed</StatusChip> : null}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
                <Cell label="Plaques" value={`${b.activePlaques} active / ${b.plaques}`} />
                <Cell label="Interactions 30d" value={String(b.interactions30)} />
                <Cell
                  label="Google listing"
                  value={b.location?.rating ? `${b.location.rating} ★ · ${b.location.reviews ?? 0}` : "Not linked"}
                />
                <Cell label="Last activity" value={new Date(b.lastActivity).toLocaleDateString()} />
              </div>
            </GlassPanel>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
