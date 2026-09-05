import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, StatusChip } from "@/components/taplocal/Field";
import { adminListOfferings, createAdminInquiry, listInquiries, type InquiryStatus } from "@/lib/inquiries.functions";

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

const field =
  "w-full rounded-xl border border-border bg-foreground/[0.04] px-3 py-2.5 text-[14px] outline-none focus:border-primary/60";

/** Field sales: log what a prospect in front of you asked about. */
function LogLead() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(adminListOfferings);
  const createFn = useServerFn(createAdminInquiry);
  const { data } = useQuery({ queryKey: ["admin-offerings"], queryFn: () => listFn({ data: undefined }) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ offeringId: "", name: "", email: "", phone: "", businessName: "", quantityInterest: "", message: "" });
  const [error, setError] = useState<string | null>(null);

  const offerings = data?.ok ? data.offerings : [];

  async function submit() {
    setError(null);
    const res = await createFn({
      data: {
        offeringId: form.offeringId || null,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone,
        businessName: form.businessName,
        quantityInterest: form.quantityInterest,
        message: form.message,
      },
    }).catch(() => ({ ok: false as const }));
    if (!res.ok) {
      setError("Couldn't save that. A name and a valid email are required.");
      return;
    }
    setForm({ offeringId: "", name: "", email: "", phone: "", businessName: "", quantityInterest: "", message: "" });
    setOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["admin-inquiries"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-inquiry-counts"] });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-[12px] font-bold tracking-wide uppercase"
      >
        + Log a lead (sales mode)
      </button>
    );
  }

  return (
    <GlassPanel className="space-y-2.5 p-4">
      <select value={form.offeringId} onChange={(e) => setForm({ ...form, offeringId: e.target.value })} className={field}>
        <option value="">What are they interested in?</option>
        {offerings.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={field} />
      <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={field} />
      <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className={field} />
      <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="Business" className={field} />
      <input value={form.quantityInterest} onChange={(e) => setForm({ ...form, quantityInterest: e.target.value })} placeholder="Quantity" className={field} />
      <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={2} placeholder="Notes" className={field} />
      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" onClick={submit} className="flex-1 rounded-xl bg-primary px-4 py-3 text-[13px] font-bold tracking-wide text-primary-foreground uppercase">
          Save lead
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-3 text-[13px] font-bold tracking-wide uppercase">
          Cancel
        </button>
      </div>
    </GlassPanel>
  );
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

      <LogLead />

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
                <StatusChip tone={i.status === "new" ? "attention" : "ok"}>{i.status.toUpperCase()}</StatusChip>
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
