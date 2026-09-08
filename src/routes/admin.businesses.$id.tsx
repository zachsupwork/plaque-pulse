import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, Stat, StatusChip } from "@/components/taplocal/Field";
import { getBusinessDetail } from "@/lib/admin-data.functions";
import { DESTINATION_LABEL, PLACEMENT_LABEL } from "@/lib/taplocal";
import { nfcUrl } from "@/lib/smartlink";
import { GoogleBusinessConnection } from "@/components/taplocal/GoogleBusinessConnection";
import { SocialProfilesPanel } from "@/components/taplocal/InstagramDiscovery";

export const Route = createFileRoute("/admin/businesses/$id")({
  head: () => ({
    meta: [
      { title: "Business record — TapLocal admin" },
      { name: "description", content: "Full platform record for one TapLocal customer business." },
      { property: "og:title", content: "Business record — TapLocal admin" },
      { property: "og:description", content: "Full platform record for one TapLocal customer business." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BusinessRecord,
});

function BusinessRecord() {
  const { id } = Route.useParams();
  const detailFn = useServerFn(getBusinessDetail);
  const q = useQuery({
    queryKey: ["admin-business", id],
    queryFn: () => detailFn({ data: { businessId: id } }),
    refetchInterval: 10_000,
  });

  const detail = q.data?.ok ? q.data.detail : null;

  if (q.isLoading) return <p className="text-[13px] text-muted-foreground">Loading…</p>;
  if (!detail) return <p className="text-[13px] text-muted-foreground">That business could not be found.</p>;

  const { business, locations, plaques, members, performance, history } = detail;
  const primaryLocation = locations[0] ?? null;


  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/businesses" className="text-[12px] font-semibold text-muted-foreground">
          ← Businesses
        </Link>
        <h1 className="mt-2 font-display text-[24px] font-bold tracking-tight">{business.name}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {business.industry} · {business.timezone} · created {new Date(business.created_at).toLocaleDateString()}
        </p>
        <div className="mt-2 flex gap-1.5">
          <StatusChip tone={business.status === "active" ? "ok" : "idle"}>{business.status}</StatusChip>
          {business.is_demo ? <StatusChip tone="brand">Demo</StatusChip> : null}
          {members.length === 0 ? <StatusChip tone="attention">No owner account</StatusChip> : null}
        </div>
      </div>

      <div>
        <SectionTitle>Quick actions</SectionTitle>
        <Link
          to="/admin/setup"
          search={{ businessId: business.id, ...(primaryLocation ? { locationId: primaryLocation.id } : {}) }}
          className="mb-2.5 flex min-h-[60px] items-center justify-center rounded-2xl bg-primary px-4 py-4 text-center text-[15px] font-bold text-primary-foreground shadow-[var(--shadow-soft)]"
        >
          Add / set up plaque
        </Link>
        <GlassPanel className="grid grid-cols-1 gap-2 p-3.5 sm:grid-cols-2">
          <Link
            to="/admin/provisioning"
            search={{ businessId: business.id, ...(primaryLocation ? { locationId: primaryLocation.id } : {}) }}
            className="rounded-xl border border-border px-4 py-3 text-center text-[13px] font-semibold"
          >
            Add new plaque
          </Link>
          <Link
            to="/admin/assign"
            search={{ businessId: business.id, ...(primaryLocation ? { locationId: primaryLocation.id } : {}) }}
            className="rounded-xl border border-border px-4 py-3 text-center text-[13px] font-semibold"
          >
            Assign existing plaque
          </Link>
          {plaques.length === 1 ? (
            <Link
              to="/admin/plaques/$id"
              params={{ id: plaques[0]!.id }}
              className="rounded-xl border border-border px-4 py-3 text-center text-[13px] font-semibold"
            >
              Manage 1 plaque
            </Link>
          ) : plaques.length > 1 ? (
            <a
              href="#smartplaques"
              className="rounded-xl border border-border px-4 py-3 text-center text-[13px] font-semibold"
            >
              Manage {plaques.length} plaques
            </a>
          ) : null}
          <Link
            to="/admin/customers"
            className="rounded-xl border border-border px-4 py-3 text-center text-[13px] font-semibold"
          >
            Owner access
          </Link>
        </GlassPanel>
      </div>


      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Today" value={performance.today} />
        <Stat label="7 days" value={performance.days7} />
        <Stat label="30 days" value={performance.days30} />
        <Stat label="All time" value={performance.allTime} hint={`${performance.nfc} NFC · ${performance.qr} QR`} />
      </div>


      <GoogleBusinessConnection businessId={business.id} plaqueSlug={plaques[0]?.public_slug ?? null} />

      <SocialProfilesPanel businessId={business.id} />

      <div>
        <SectionTitle>Locations</SectionTitle>
        <GlassPanel className="divide-y divide-border">
          {locations.length === 0 ? <p className="p-4 text-[13px] text-muted-foreground">No locations yet.</p> : null}
          {locations.map((l) => (
            <div key={l.id} className="p-3.5">
              <p className="text-[13px] font-semibold">{l.name}</p>
              <p className="text-[12px] text-muted-foreground">{[l.address, l.city].filter(Boolean).join(", ")}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {l.google_rating ? `${l.google_rating} ★ · ${l.google_review_count ?? 0} reviews` : "Google listing not linked"}
              </p>
            </div>
          ))}
        </GlassPanel>
      </div>

      <div id="smartplaques">
        <SectionTitle>
          SmartPlaques — {plaques.length} {plaques.length === 1 ? "plaque" : "plaques"} at this business
        </SectionTitle>
        <div className="space-y-2.5">
          {plaques.length === 0 ? (
            <GlassPanel className="p-4 text-[13px] text-muted-foreground">No plaques assigned yet.</GlassPanel>
          ) : null}
          {plaques.map((p) => (
            <GlassPanel key={p.id} className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold">{p.plaque_name ?? p.plaque_code}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {[p.placement_type ? PLACEMENT_LABEL[p.placement_type] ?? p.placement_type : null,
                      p.destination ? DESTINATION_LABEL[p.destination.type] ?? p.destination.type : "No destination"]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{nfcUrl(p.public_slug)}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{qrUrl(p.public_slug)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <StatusChip tone={p.status === "active" ? "ok" : "idle"}>{p.status}</StatusChip>
                  <p className="mt-1 text-[11px] text-muted-foreground">{p.interactions30} taps / 30d</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Link
                  to="/admin/plaques/$id"
                  params={{ id: p.id }}
                  className="rounded-xl bg-primary px-3 py-2.5 text-center text-[12px] font-bold text-primary-foreground"
                >
                  Manage
                </Link>
                <Link
                  to="/admin/setup"
                  search={{
                    businessId: business.id,
                    ...(primaryLocation ? { locationId: primaryLocation.id } : {}),
                    plaqueId: p.id,
                  }}
                  className="rounded-xl border border-border px-3 py-2.5 text-center text-[12px] font-semibold"
                >
                  Destination
                </Link>
                <Link
                  to="/admin/plaques/$id/program"
                  params={{ id: p.id }}
                  className="rounded-xl border border-border px-3 py-2.5 text-center text-[12px] font-semibold"
                >
                  Program
                </Link>
              </div>
            </GlassPanel>
          ))}
          <Link
            to="/admin/provisioning"
            search={{ businessId: business.id, ...(primaryLocation ? { locationId: primaryLocation.id } : {}) }}
            className="flex min-h-[48px] items-center justify-center rounded-2xl border border-dashed border-border text-[13px] font-bold"
          >
            + Add another plaque
          </Link>
        </div>
      </div>

      <div>
        <SectionTitle>People</SectionTitle>
        <GlassPanel className="divide-y divide-border">
          {members.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground">
              Nobody has claimed this business yet — TapLocal is managing it.
            </p>
          ) : null}
          {members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{m.name ?? m.email ?? m.userId}</p>
                <p className="truncate text-[12px] text-muted-foreground">{m.email}</p>
              </div>
              <StatusChip tone="idle">{m.role}</StatusChip>
            </div>
          ))}
        </GlassPanel>
      </div>

      <div>
        <SectionTitle>Change history</SectionTitle>
        <GlassPanel className="divide-y divide-border">
          {history.length === 0 ? <p className="p-4 text-[13px] text-muted-foreground">No changes recorded.</p> : null}
          {history.map((h, i) => (
            <div key={`${h.created_at}-${i}`} className="flex items-center justify-between gap-3 p-3.5 text-[12px]">
              <span className="font-semibold">{h.action_type.replace(/_/g, " ")}</span>
              <span className="text-muted-foreground">
                {h.initiated_by} · {new Date(h.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </GlassPanel>
      </div>
    </div>
  );
}
