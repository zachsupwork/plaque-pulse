import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, Stat, StatusChip } from "@/components/taplocal/Field";
import { networkActivity, networkOverview } from "@/lib/admin-data.functions";
import { inquiryCounts } from "@/lib/inquiries.functions";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Network overview — TapLocal admin" },
      { name: "description", content: "Real TapLocal businesses, plaques, taps and scans — demo data excluded." },
      { property: "og:title", content: "Network overview — TapLocal admin" },
      { property: "og:description", content: "Real TapLocal businesses, plaques, taps and scans — demo data excluded." },
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

const QUICK_ACTIONS = [
  { to: "/admin/provisioning", label: "+ Create plaques", tone: "primary" as const },
  { to: "/admin/nfc/write", label: "Program NFC", tone: "plain" as const },
  { to: "/admin/nfc/verify", label: "Verify plaque", tone: "plain" as const },
  { to: "/admin/businesses", label: "Find / add business", tone: "plain" as const },
  { to: "/admin/plaques", label: "Set up customer", tone: "plain" as const },
  { to: "/admin/inquiries", label: "Inquiries", tone: "plain" as const },
  { to: "/demo", label: "Sales mode", tone: "outline" as const },
];

function AdminDashboard() {
  const overviewFn = useServerFn(networkOverview);
  const activityFn = useServerFn(networkActivity);

  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => overviewFn({ data: undefined }) });
  const activity = useQuery({ queryKey: ["admin-activity"], queryFn: () => activityFn({ data: undefined }) });

  const o = overview.data?.ok ? overview.data : null;
  const items = activity.data?.ok ? activity.data.items : [];

  const countsFn = useServerFn(inquiryCounts);
  const counts = useQuery({ queryKey: ["admin-inquiry-counts"], queryFn: () => countsFn({ data: undefined }) });
  const newInquiries = counts.data?.ok ? (counts.data.counts["new"] ?? 0) : 0;
  const followUps = counts.data?.ok
    ? (counts.data.counts["contacted"] ?? 0) + (counts.data.counts["follow_up"] ?? 0)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold tracking-tight">TapLocal Admin</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Today · real operations only</p>
        </div>
        <StatusChip tone="ok">REAL</StatusChip>
      </div>

      <Link
        to="/admin/inquiries"
        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]"
      >
        <div>
          <p className="text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            New inquiries
          </p>
          <p className="mt-1 font-display text-[22px] font-bold tracking-tight">
            {newInquiries} new
            {followUps ? <span className="text-[14px] text-muted-foreground"> · {followUps} to follow up</span> : null}
          </p>
        </div>
        <span className="rounded-xl bg-primary px-3.5 py-2.5 text-[12px] font-bold tracking-wide text-primary-foreground uppercase">
          Review
        </span>
      </Link>

      <div>
        <SectionTitle>Today</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <Stat label="Interactions" value={o ? o.interactionsToday : "—"} />
          <Stat label="NFC" value={o ? o.nfcToday : "—"} />
          <Stat label="QR" value={o ? o.qrToday : "—"} />
          <Stat label="Active businesses" value={o ? o.businessesActive : "—"} />
          <Stat label="Active plaques" value={o ? o.plaquesActive : "—"} />
        </div>
      </div>

      <div>
        <SectionTitle>Quick actions</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.label}
              to={a.to}
              className={`flex min-h-[56px] items-center justify-center rounded-2xl px-3 py-3 text-center text-[14px] font-bold ${
                a.tone === "primary"
                  ? "bg-primary text-primary-foreground"
                  : a.tone === "outline"
                    ? "border border-primary/40 bg-primary/10 text-primary"
                    : "border border-border bg-card shadow-[var(--shadow-soft)]"
              }`}
            >
              {a.label}
            </Link>
          ))}
          <Link
            to="/admin/plaques"
            className="col-span-2 flex min-h-[52px] items-center justify-center rounded-2xl border border-border bg-card text-[14px] font-bold shadow-[var(--shadow-soft)]"
          >
            View all plaques
          </Link>
        </div>
      </div>

      <div>
        <SectionTitle
          action={
            <Link to="/admin/provisioning" className="text-[12px] font-semibold text-primary">
              Manufacturing →
            </Link>
          }
        >
          Inventory
        </SectionTitle>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Ready" value={o ? o.plaquesInventory : "—"} />
          <Stat label="Configured" value={o ? o.plaquesConfigured : "—"} />
          <Stat label="Packed" value={o ? o.plaquesPacked : "—"} />
          <Stat label="Need attention" value={o ? o.plaquesFaulty : "—"} />
        </div>
        {o && o.plaquesTotal === 0 ? (
          <GlassPanel className="mt-2.5 p-4 text-[13px] text-muted-foreground">
            No plaques manufactured yet.{" "}
            <Link to="/admin/provisioning" className="font-semibold text-primary">
              Open manufacturing
            </Link>
          </GlassPanel>
        ) : null}
      </div>

      <div>
        <SectionTitle
          action={
            <Link to="/admin/analytics" className="text-[12px] font-semibold text-primary">
              All analytics →
            </Link>
          }
        >
          Real interactions
        </SectionTitle>
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Last 7 days" value={o ? o.interactions7 : "—"} />
          <Stat label="Last 30 days" value={o ? o.interactions30 : "—"} />
          <Stat label="Businesses" value={o ? o.businessesTotal : "—"} />
        </div>
        {o && o.businessesTotal === 0 ? (
          <GlassPanel className="mt-2.5 p-4 text-[13px] text-muted-foreground">
            No real businesses yet.{" "}
            <Link to="/admin/businesses" className="font-semibold text-primary">
              Add / find a business
            </Link>
          </GlassPanel>
        ) : null}
      </div>

      <div>
        <SectionTitle>Recent real activity</SectionTitle>
        <GlassPanel className="divide-y divide-border">
          {activity.isLoading ? <p className="p-4 text-[13px] text-muted-foreground">Loading…</p> : null}
          {!activity.isLoading && items.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground">
              No real customer activity yet. Customer taps and scans will appear here.
            </p>
          ) : null}
          {items.map((item, i) => (
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
