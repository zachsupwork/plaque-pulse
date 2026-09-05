import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, StatusChip } from "@/components/taplocal/Field";
import { getInquiry, setInquiryStatus, type InquiryStatus } from "@/lib/inquiries.functions";

export const Route = createFileRoute("/admin/inquiries/$id")({
  head: () => ({
    meta: [
      { title: "Inquiry — TapLocal admin" },
      { name: "description", content: "One TapLocal lead: contact, business and interest." },
      { property: "og:title", content: "Inquiry — TapLocal admin" },
      { property: "og:description", content: "One TapLocal lead: contact, business and interest." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InquiryDetail,
});

const ACTIONS: { status: InquiryStatus; label: string }[] = [
  { status: "contacted", label: "Mark contacted" },
  { status: "qualified", label: "Qualify" },
  { status: "follow_up", label: "Follow up" },
  { status: "won", label: "Mark won" },
  { status: "not_interested", label: "Not interested" },
  { status: "closed", label: "Close" },
];

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="text-[12px] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-right text-[13px] font-semibold break-words">{value}</span>
    </div>
  );
}

function InquiryDetail() {
  const { id } = useParams({ from: "/admin/inquiries/$id" });
  const queryClient = useQueryClient();
  const fetchOne = useServerFn(getInquiry);
  const setStatus = useServerFn(setInquiryStatus);

  const { data, isPending } = useQuery({
    queryKey: ["admin-inquiry", id],
    queryFn: () => fetchOne({ data: { id } }),
  });

  async function mark(status: InquiryStatus) {
    await setStatus({ data: { id, status } });
    await queryClient.invalidateQueries({ queryKey: ["admin-inquiry", id] });
    await queryClient.invalidateQueries({ queryKey: ["admin-inquiries"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-inquiry-counts"] });
  }

  if (isPending) return <div className="h-40 animate-pulse rounded-2xl bg-foreground/[0.06]" />;

  const q = data?.ok ? data.inquiry : null;
  if (!q) {
    return (
      <GlassPanel className="p-6">
        <p className="text-[14px] font-semibold">We couldn't open that inquiry.</p>
        <Link to="/admin/inquiries" className="mt-3 inline-block text-[13px] font-semibold text-primary">
          ← Back to inquiries
        </Link>
      </GlassPanel>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/admin/inquiries" className="text-[13px] text-muted-foreground">
        ← Inquiries
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] leading-tight font-bold tracking-tight">
            {q.offering_name ?? "General interest"}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Received {new Date(q.created_at).toLocaleString()} · {q.source}
          </p>
        </div>
        <StatusChip tone={q.status === "new" ? "attention" : "ok"}>{q.status.toUpperCase()}</StatusChip>
      </div>

      <GlassPanel className="p-4">
        <h2 className="font-display text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Contact
        </h2>
        <div className="mt-1.5">
          <Row label="Name" value={q.name} />
          <Row label="Email" value={q.email} />
          <Row label="Phone" value={q.phone} />
          <Row label="Prefers" value={q.preferred_contact_method} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {q.phone ? (
            <a
              href={`tel:${q.phone}`}
              className="rounded-xl bg-primary px-3.5 py-2.5 text-[12px] font-bold tracking-wide text-primary-foreground uppercase"
            >
              Call
            </a>
          ) : null}
          <a
            href={`mailto:${q.email}`}
            className="rounded-xl border border-border px-3.5 py-2.5 text-[12px] font-bold tracking-wide uppercase"
          >
            Email
          </a>
          {q.phone ? (
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(q.phone ?? "")}
              className="rounded-xl border border-border px-3.5 py-2.5 text-[12px] font-bold tracking-wide uppercase"
            >
              Copy phone
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(q.email)}
            className="rounded-xl border border-border px-3.5 py-2.5 text-[12px] font-bold tracking-wide uppercase"
          >
            Copy email
          </button>
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <h2 className="font-display text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Business
        </h2>
        <div className="mt-1.5">
          <Row label="Name" value={q.business_name} />
          <Row label="Address" value={q.business_address} />
          <Row label="Google listing" value={q.google_place_id} />
        </div>
        {!q.business_name ? (
          <p className="mt-2 text-[13px] text-muted-foreground">No business details given.</p>
        ) : null}
      </GlassPanel>

      <GlassPanel className="p-4">
        <h2 className="font-display text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Interest
        </h2>
        <div className="mt-1.5">
          <Row label="Offering" value={q.offering_name} />
          <Row label="Quantity" value={q.quantity_interest} />
          <Row label="Source" value={q.source} />
        </div>
        {q.message ? (
          <p className="mt-3 rounded-xl border border-border bg-foreground/[0.04] p-3 text-[13px] leading-relaxed">
            {q.message}
          </p>
        ) : null}
      </GlassPanel>

      <GlassPanel className="p-4">
        <h2 className="font-display text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Timeline
        </h2>
        <div className="mt-1.5">
          <Row label="Submitted" value={new Date(q.created_at).toLocaleString()} />
          <Row label="Contacted" value={q.contacted_at ? new Date(q.contacted_at).toLocaleString() : null} />
          <Row label="Closed" value={q.closed_at ? new Date(q.closed_at).toLocaleString() : null} />
        </div>
      </GlassPanel>

      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.status}
            type="button"
            onClick={() => mark(a.status)}
            className={`rounded-xl px-3.5 py-2.5 text-[12px] font-bold tracking-wide uppercase ${
              q.status === a.status ? "bg-primary text-primary-foreground" : "border border-border"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <GlassPanel className="p-4">
        <h2 className="font-display text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Turn this into a customer
        </h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Set the business up, then assign a plaque and its destination.
        </p>
        <div className="mt-3 space-y-2">
          <Link
            to="/admin/businesses"
            className="block rounded-xl bg-primary px-4 py-3 text-center text-[13px] font-bold tracking-wide text-primary-foreground uppercase"
          >
            Set up business
          </Link>
          <Link
            to="/admin/plaques"
            className="block rounded-xl border border-border px-4 py-3 text-center text-[13px] font-bold tracking-wide uppercase"
          >
            Set up plaque
          </Link>
        </div>
      </GlassPanel>
    </div>
  );
}
