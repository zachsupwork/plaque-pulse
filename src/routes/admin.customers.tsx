import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, StatusChip } from "@/components/taplocal/Field";
import { listCustomers } from "@/lib/admin-data.functions";

export const Route = createFileRoute("/admin/customers")({
  head: () => ({
    meta: [
      { title: "Customer accounts — TapLocal admin" },
      { name: "description", content: "Every TapLocal account and the businesses they can reach." },
      { property: "og:title", content: "Customer accounts — TapLocal admin" },
      { property: "og:description", content: "Every TapLocal account and the businesses they can reach." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Customers,
});

function Customers() {
  const listFn = useServerFn(listCustomers);
  const [query, setQuery] = useState("");
  const list = useQuery({ queryKey: ["admin-customers", query], queryFn: () => listFn({ data: { query } }) });
  const rows = list.data?.ok ? list.data.customers : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Customers</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{rows.length} accounts</p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name, email or phone"
        className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[14px] outline-none focus:border-primary/60"
      />

      {list.isLoading ? <p className="text-[13px] text-muted-foreground">Loading…</p> : null}

      <div className="space-y-2.5">
        {rows.map((c) => (
          <GlassPanel key={c.userId} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold">{c.name ?? c.email ?? "Account"}</p>
                <p className="truncate text-[12px] text-muted-foreground">{c.email}</p>
                {c.phone ? <p className="truncate text-[12px] text-muted-foreground">{c.phone}</p> : null}
              </div>
              <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                <p>Joined {new Date(c.joinedAt).toLocaleDateString()}</p>
                <p>{c.lastSignInAt ? `Last seen ${new Date(c.lastSignInAt).toLocaleDateString()}` : "Never signed in"}</p>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {c.memberships.length === 0 ? <StatusChip tone="attention">No business linked</StatusChip> : null}
              {c.memberships.map((m) => (
                <Link key={m.businessId} to="/admin/businesses/$id" params={{ id: m.businessId }}>
                  <StatusChip tone="brand">
                    {m.businessName} · {m.role}
                  </StatusChip>
                </Link>
              ))}
            </div>
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}
