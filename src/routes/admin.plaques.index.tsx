import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, StatusChip } from "@/components/taplocal/Field";
import { listAllPlaques } from "@/lib/admin-data.functions";
import { PLACEMENT_LABEL } from "@/lib/taplocal";

export const Route = createFileRoute("/admin/plaques/")({
  head: () => ({
    meta: [
      { title: "Plaque inventory — TapLocal admin" },
      { name: "description", content: "Every SmartPlaque, its owner, its destination and its live tap count." },
      { property: "og:title", content: "Plaque inventory — TapLocal admin" },
      { property: "og:description", content: "Every SmartPlaque, its owner, its destination and its live tap count." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlaqueInventory,
});

const STATUSES = ["all", "inventory", "packed", "sold", "configured_unclaimed", "claimed", "active", "paused", "faulty", "retired"];

function PlaqueInventory() {
  const listFn = useServerFn(listAllPlaques);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const list = useQuery({
    queryKey: ["admin-plaques", query, status],
    queryFn: () => listFn({ data: { query, status } }),
  });

  const rows = list.data?.ok ? list.data.plaques : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold tracking-tight">Plaques</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{rows.length} shown</p>
        </div>
        <Link
          to="/admin/provisioning"
          className="rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground"
        >
          Provision new
        </Link>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Plaque ID, slug, batch, business or name"
        className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[14px] outline-none focus:border-primary/60"
      />

      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
              status === s ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {list.isLoading ? <p className="text-[13px] text-muted-foreground">Loading…</p> : null}
      {!list.isLoading && rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No plaques match that.</p>
      ) : null}

      <div className="space-y-2.5">
        {rows.map((p) => (
          <Link key={p.id} to="/admin/plaques/$id" params={{ id: p.id }} className="block">
            <GlassPanel className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-bold tracking-tight">
                    {p.plaque_name ?? p.plaque_code}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {[p.businessName ?? "Unassigned", p.locationName, p.placement_type ? PLACEMENT_LABEL[p.placement_type] ?? p.placement_type : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {p.plaque_code} · /{p.public_slug} {p.batch_id ? `· batch ${p.batch_id}` : ""}
                  </p>
                </div>
                <div className="shrink-0 space-y-1 text-right">
                  <StatusChip tone={p.status === "active" ? "ok" : p.status === "faulty" ? "problem" : "idle"}>
                    {p.status.replace(/_/g, " ")}
                  </StatusChip>
                  <p className="text-[11px] text-muted-foreground">
                    {p.interactionsToday} today · {p.interactions30} / 30d
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.writeStatus === "written" ? "Written" : "Not written"} ·{" "}
                    {p.verificationStatus === "verified" ? "Verified" : "Unverified"}
                  </p>
                </div>
              </div>
            </GlassPanel>
          </Link>
        ))}
      </div>
    </div>
  );
}
