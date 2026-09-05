import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, Stat } from "@/components/taplocal/Field";
import { networkActivity, networkOverview } from "@/lib/admin-data.functions";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Network overview — TapLocal admin" },
      { name: "description", content: "Live counts of TapLocal businesses, plaques, taps and scans." },
      { property: "og:title", content: "Network overview — TapLocal admin" },
      { property: "og:description", content: "Live counts of TapLocal businesses, plaques, taps and scans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDashboard,
});

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  return `${Math.round(hrs / 24)} day${Math.round(hrs / 24) === 1 ? "" : "s"} ago`;
}

function AdminDashboard() {
  const overviewFn = useServerFn(networkOverview);
  const activityFn = useServerFn(networkActivity);

  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => overviewFn({ data: undefined }) });
  const activity = useQuery({ queryKey: ["admin-activity"], queryFn: () => activityFn({ data: undefined }) });

  const o = overview.data?.ok ? overview.data : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">TapLocal Admin</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Today · network overview</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Interactions today" value={o ? o.interactionsToday : "—"} hint={o ? `${o.nfcToday} NFC · ${o.qrToday} QR` : undefined} />
        <Stat label="Last 7 days" value={o ? o.interactions7 : "—"} />
        <Stat label="Last 30 days" value={o ? o.interactions30 : "—"} />
        <Stat label="Businesses" value={o ? o.businessesTotal : "—"} hint={o ? `${o.businessesActive} active` : undefined} />
      </div>

      <div>
        <SectionTitle>Plaque inventory</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <Stat label="Total" value={o ? o.plaquesTotal : "—"} />
          <Stat label="Inventory" value={o ? o.plaquesInventory : "—"} />
          <Stat label="Configured" value={o ? o.plaquesConfigured : "—"} />
          <Stat label="Active" value={o ? o.plaquesActive : "—"} />
          <Stat label="Packed" value={o ? o.plaquesPacked : "—"} />
        </div>
      </div>

      <div>
        <SectionTitle>This month</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          <Stat label="Businesses activated" value={o ? o.businessesThisMonth : "—"} />
          <Stat label="Plaques activated" value={o ? o.plaquesActivatedThisMonth : "—"} />
        </div>
      </div>

      <div>
        <SectionTitle
          action={
            <Link to="/admin/analytics" className="text-[12px] font-semibold text-primary">
              All analytics →
            </Link>
          }
        >
          Recent activity
        </SectionTitle>
        <GlassPanel className="divide-y divide-border">
          {activity.isLoading ? <p className="p-4 text-[13px] text-muted-foreground">Loading…</p> : null}
          {activity.data?.ok && activity.data.items.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground">No activity recorded yet.</p>
          ) : null}
          {(activity.data?.ok ? activity.data.items : []).map((item, i) => (
            <div key={`${item.at}-${i}`} className="flex items-center justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{item.business}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {[item.plaque, item.placement, item.label].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">{ago(item.at)}</span>
            </div>
          ))}
        </GlassPanel>
      </div>
    </div>
  );
}
