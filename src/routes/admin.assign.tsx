import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { GlassPanel, SectionTitle, StatusChip } from "@/components/taplocal/Field";
import { availableInventory, workbenchBusiness } from "@/lib/workbench.functions";
import { nfcUrl, qrUrl } from "@/lib/smartlink";

export const Route = createFileRoute("/admin/assign")({
  head: () => ({
    meta: [
      { title: "Assign a plaque — TapLocal admin" },
      { name: "description", content: "Pick an unassigned TapLocal plaque and attach it to the selected place." },
      { property: "og:title", content: "Assign a plaque — TapLocal admin" },
      { property: "og:description", content: "Pick an unassigned TapLocal plaque and attach it to the selected place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { businessId?: string; locationId?: string } => ({
    ...(typeof search["businessId"] === "string" ? { businessId: search["businessId"] as string } : {}),
    ...(typeof search["locationId"] === "string" ? { locationId: search["locationId"] as string } : {}),
  }),
  component: AssignExisting,
});

function AssignExisting() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const businessFn = useServerFn(workbenchBusiness);
  const inventoryFn = useServerFn(availableInventory);

  const business = useQuery({
    queryKey: ["assign-business", search.businessId],
    enabled: Boolean(search.businessId),
    queryFn: () => businessFn({ data: { businessId: search.businessId! } }),
  });
  const biz = business.data?.ok ? business.data.business : null;
  const location =
    (search.locationId ? biz?.locations?.find((l) => l.id === search.locationId) : null) ?? biz?.locations?.[0] ?? null;

  const inventory = useQuery({
    queryKey: ["assign-inventory", query],
    queryFn: () => inventoryFn({ data: { query } }),
  });
  const plaques = inventory.data?.ok ? inventory.data.plaques : [];

  return (
    <div className="space-y-5">
      <div>
        {search.businessId ? (
          <Link
            to="/admin/businesses/$id"
            params={{ id: search.businessId }}
            className="text-[12px] font-semibold text-muted-foreground"
          >
            ← Back
          </Link>
        ) : null}
        <h1 className="mt-2 font-display text-[24px] font-bold tracking-tight">Assign existing plaque</h1>
        {biz ? (
          <p className="mt-1 text-[13px] text-muted-foreground">
            To: <span className="font-semibold text-foreground">{biz.name}</span>
            {location ? ` · ${[location.address, location.city].filter(Boolean).join(", ")}` : ""}
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-muted-foreground">
            No place selected — open this from a business to keep its context.
          </p>
        )}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by plaque code, slug or batch"
        className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[14px] outline-none focus:border-primary/60"
      />

      <div>
        <SectionTitle>{plaques.length} available in inventory</SectionTitle>
        <div className="space-y-2.5">
          {plaques.length === 0 ? (
            <GlassPanel className="p-4 text-[13px] text-muted-foreground">
              No unassigned plaques match. Create more from Manufacturing.
            </GlassPanel>
          ) : null}
          {plaques.map((p) => (
            <GlassPanel key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-[16px] font-bold tracking-tight">{p.plaque_code}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">NFC {nfcUrl(p.public_slug)}</p>
                  <p className="text-[11px] text-muted-foreground">QR {qrUrl(p.public_slug)}</p>
                </div>
                <div className="shrink-0 space-y-1 text-right">
                  <StatusChip tone={p.writeStatus === "programmed" ? "ok" : "idle"}>
                    {p.writeStatus === "programmed" ? "Programmed ✓" : "Not programmed"}
                  </StatusChip>
                  <StatusChip tone={p.verificationStatus === "verified" ? "ok" : "idle"}>
                    {p.verificationStatus === "verified" ? "Verified ✓" : "Not verified"}
                  </StatusChip>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!search.businessId}
                  onClick={() =>
                    navigate({
                      to: "/admin/setup",
                      search: {
                        businessId: search.businessId!,
                        ...(location ? { locationId: location.id } : {}),
                        plaqueId: p.id,
                      },
                    })
                  }
                  className="rounded-xl bg-primary px-4 py-3 text-[13px] font-bold text-primary-foreground disabled:opacity-50"
                >
                  {biz ? `Assign to ${biz.name}` : "Choose a place first"}
                </button>
                <Link
                  to="/admin/plaques/$id"
                  params={{ id: p.id }}
                  className="rounded-xl border border-border px-4 py-3 text-center text-[13px] font-semibold"
                >
                  Manage
                </Link>
              </div>
            </GlassPanel>
          ))}
        </div>
      </div>
    </div>
  );
}
