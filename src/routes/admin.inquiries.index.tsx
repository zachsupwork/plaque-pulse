import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, StatusChip } from "@/components/taplocal/Field";
import { listInquiries, type InquiryStatus } from "@/lib/inquiries.functions";

export const Route = createFileRoute("/admin/inquiries/")({
  head: () => ({
    meta: [
      { title: "Inquiries — TapLocal admin" },
      { name: "description", content: "Real interest from the TapLocal catalog and field sales." },
      { property: "og:title", content: "Inquiries — TapLocal admin" },
      { property: "og:description", content: "Real interest from the TapLocal catalog and field sales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InquiriesPage,
});

const TABS: { key: string; label: string; statuses: InquiryStatus[] }[] = [
  { key: "new", label: "New", statuses: ["new"] },
  { key: "follow_up", label: "Follow up", statuses: ["follow_up", "contacted"] },
  { key: "qualified", label: "Qualified", statuses: ["qualified"] },
  { key: "won", label: "Won", statuses: ["won"] },
  { key: "closed", label: "Closed", statuses: ["closed", "not_interested"] },
];

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function InquiriesPage() {
  const [tab, setTab] = useState(TABS[0]!);
  const listFn = useServerFn(listInquiries);
  const { data, isPending } = useQuery({
    queryKey: ["admin-inquiries", tab.key],
    queryFn: () => listFn({ data: { statuses: tab.statuses } }),
  });

  const items = data?.ok ? data.items : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Inquiries</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Real interest only — nothing from the demo.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-xl border px-3.5 py-2 text-[13px] font-semibold ${
              tab.key === t.key ? "border-primary bg-primary/10 text-primary" : "border-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <div className="h-24 animate-pulse rounded-2xl bg-foreground/[0.06]" />
      ) : items.length ? (
        <div className="space-y-2.5">
          {items.map((i) => (
            <Link
              key={i.id}
              to="/admin/inquiries/$id"
              params={{ id: i.id }}
              className="block rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-bold tracking-tight">
                    {i.offering_name ?? "General interest"}
                  </p>
                  <p className="mt-0.5 truncate text-[13px]">
                    {i.name}
                    {i.business_name ? ` · ${i.business_name}` : ""}
                  </p>
                  <p className="mt-1 truncate text-[12px] text-muted-foreground">
                    {i.email}
                    {i.phone ? ` · ${i.phone}` : ""}
                    {i.quantity_interest ? ` · qty ${i.quantity_interest}` : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {when(i.created_at)} · {i.source}
                  </p>
                </div>
                <StatusChip tone={i.status === "new" ? "warn" : "ok"}>{i.status.toUpperCase()}</StatusChip>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <GlassPanel className="p-6 text-center">
          <p className="text-[14px] font-semibold">Nothing here yet</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            New interest from the catalog will appear here as soon as someone sends it.
          </p>
        </GlassPanel>
      )}
    </div>
  );
}
