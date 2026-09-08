import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, StatusChip } from "@/components/taplocal/Field";
import { CopyButton, QrSheet } from "@/components/taplocal/LinkTools";
import { SmartlinkHostCheck } from "@/components/taplocal/SmartlinkInfra";
import { BASE_TYPES, PRODUCT_TYPES, STYLES, provisionPlaques } from "@/lib/admin.functions";
import { workbenchBusiness } from "@/lib/workbench.functions";

export const Route = createFileRoute("/admin/provisioning")({
  validateSearch: (search: Record<string, unknown>): { businessId?: string; locationId?: string } => ({
    ...(typeof search["businessId"] === "string" ? { businessId: search["businessId"] } : {}),
    ...(typeof search["locationId"] === "string" ? { locationId: search["locationId"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Manufacturing — TapLocal admin" },
      { name: "description", content: "Provision new SmartPlaques and print their activation codes." },
      { property: "og:title", content: "Manufacturing — TapLocal admin" },
      { property: "og:description", content: "Provision new SmartPlaques and print their activation codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Provisioning,
});

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Provisioning() {
  const search = Route.useSearch();
  const provision = useServerFn(provisionPlaques);
  const businessFn = useServerFn(workbenchBusiness);

  const [quantity, setQuantity] = useState(1);
  const [productType, setProductType] = useState<string>(PRODUCT_TYPES[0]);
  const [style, setStyle] = useState<string>(STYLES[0]);
  const [baseType, setBaseType] = useState<string>(BASE_TYPES[0]);
  const [batchId, setBatchId] = useState("");
  const [qr, setQr] = useState<{ url: string; title: string; lines: string[] } | null>(null);

  const businessId = search.businessId ?? null;

  const business = useQuery({
    queryKey: ["provisioning-business", businessId],
    enabled: Boolean(businessId),
    queryFn: () => businessFn({ data: { businessId: businessId! } }),
  });
  const biz = business.data?.ok ? business.data.business : null;
  const location =
    biz?.locations?.find((l) => l.id === search.locationId) ?? biz?.locations?.[0] ?? null;
  const address = location ? [location.address, location.city].filter(Boolean).join(", ") : null;

  const run = useMutation({
    mutationFn: () =>
      provision({
        data: {
          quantity,
          productType,
          style,
          baseType,
          batchId: batchId || null,
          businessId,
          locationId: location?.id ?? null,
        },
      }),
  });

  const result = run.data;
  const created = result?.ok ? result.plaques : [];

  return (
    <div className="space-y-5">
      <div>
        {businessId ? (
          <Link
            to="/admin/businesses/$id"
            params={{ id: businessId }}
            className="text-[12px] font-semibold text-muted-foreground"
          >
            ← Back to {biz?.name ?? "business"}
          </Link>
        ) : null}
        <h1 className="mt-1 font-display text-[24px] font-bold tracking-tight">
          {businessId ? "Add plaque to this place" : "Manufacturing"}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {businessId
            ? "New plaques are created already attached to this business — no searching afterwards."
            : "Create blank stock plaques with their permanent links and one-time activation codes."}
        </p>
      </div>

      {businessId ? (
        <GlassPanel className="p-4">
          <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Adding plaque to</p>
          <p className="mt-1 font-display text-[19px] font-bold tracking-tight">{biz?.name ?? "Loading…"}</p>
          <p className="text-[13px] text-muted-foreground">{address ?? "No address on file"}</p>
          {biz && biz.locations.length > 1 ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              This business has {biz.locations.length} locations — plaques are attached to the one shown here.
            </p>
          ) : null}
        </GlassPanel>
      ) : (
        <GlassPanel className="p-4">
          <p className="text-[13px] font-semibold">General inventory</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            These plaques belong to no business yet. To create plaques for a specific place, start from that business
            record instead.
          </p>
        </GlassPanel>
      )}

      <SmartlinkHostCheck urls={created.flatMap((p) => [p.nfcUrl, p.qrUrl, p.activationUrl])} />

      <GlassPanel className="space-y-3 p-4">
        <div>
          <p className="mb-1 text-[12px] font-semibold text-muted-foreground">How many?</p>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setQuantity(n)}
                className={`min-w-[46px] rounded-xl border px-3 py-2 text-[13px] font-bold ${
                  quantity === n ? "border-primary/50 bg-primary/10 text-primary" : "border-border"
                }`}
              >
                {n}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={50}
              value={quantity}
              onChange={(e) => setQuantity(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              aria-label="Custom quantity"
              className="w-[92px] rounded-xl border border-border bg-card px-3 py-2 text-[13px]"
            />
          </div>
        </div>
        <Select label="Product" value={productType} onChange={setProductType} options={[...PRODUCT_TYPES]} />
        <Select label="Style" value={style} onChange={setStyle} options={[...STYLES]} />
        <Select label="Base" value={baseType} onChange={setBaseType} options={[...BASE_TYPES]} />
        <div>
          <p className="mb-1 text-[12px] font-semibold text-muted-foreground">Batch ID (optional)</p>
          <input
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            placeholder="2026-01-A"
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13px]"
          />
        </div>
        <button
          type="button"
          disabled={run.isPending}
          onClick={() => run.mutate()}
          className="w-full rounded-xl bg-primary px-4 py-3.5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
        >
          {run.isPending ? "Creating…" : `Create ${quantity} plaque${quantity === 1 ? "" : "s"}`}
        </button>
      </GlassPanel>

      {result && !result.ok ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[13px] text-destructive">
          {result.error === "bad_location"
            ? "That location doesn't belong to this business."
            : result.error === "business_not_found"
              ? "That business no longer exists."
              : "That was rejected — sign in again as a TapLocal admin."}
        </p>
      ) : null}

      {created.length > 0 ? (
        <div className="space-y-2.5">
          <SectionTitle>
            {created.length} plaque{created.length === 1 ? "" : "s"} created ✓
          </SectionTitle>
          {biz ? (
            <GlassPanel className="p-3.5">
              <p className="font-display text-[16px] font-bold tracking-tight">{biz.name}</p>
              <p className="text-[12px] text-muted-foreground">{address ?? "No address on file"}</p>
            </GlassPanel>
          ) : null}

          {created.map((p, i) => (
            <GlassPanel key={p.id} className="space-y-2.5 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                    {i + 1} of {created.length}
                  </p>
                  <Link
                    to="/admin/plaques/$id"
                    params={{ id: p.id }}
                    className="font-display text-[18px] font-bold tracking-tight text-primary"
                  >
                    {p.plaqueCode}
                  </Link>
                  <p className="text-[12px] text-muted-foreground">Slug {p.publicSlug}</p>
                </div>
                <StatusChip tone="attention">{businessId ? "Needs setup" : "Inventory"}</StatusChip>
              </div>

              <div className="space-y-1.5 rounded-xl border border-border p-2.5 text-[11px]">
                <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                  Public SmartLinks — permanent
                </p>
                <p className="font-mono break-all">NFC · {p.nfcUrl}</p>
                <p className="font-mono break-all">QR · {p.qrUrl}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <CopyButton value={p.nfcUrl} label="Copy NFC" />
                  <CopyButton value={p.qrUrl} label="Copy QR" />
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-2.5 text-[11px]">
                <p className="text-[10px] font-bold tracking-[0.12em] text-amber-600 uppercase">
                  Private owner activation — shown once
                </p>
                <p className="mt-1 font-mono text-[15px] font-bold tracking-[0.18em]">{p.activationCode}</p>
                <p className="mt-1 font-mono break-all text-muted-foreground">{p.activationUrl}</p>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Link
                  to="/admin/setup"
                  search={{
                    ...(businessId ? { businessId } : {}),
                    plaqueId: p.id,
                    ...(location?.id ? { locationId: location.id } : {}),
                  }}
                  className="rounded-xl bg-primary py-2.5 text-center text-[12px] font-bold text-primary-foreground"
                >
                  {businessId ? "Set up now" : "Assign / set up"}
                </Link>
                <Link
                  to="/admin/plaques/$id/program"
                  params={{ id: p.id }}
                  className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold"
                >
                  Program NFC
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    setQr({ url: p.qrUrl, title: p.plaqueCode, lines: [p.plaqueCode, `Slug ${p.publicSlug}`] })
                  }
                  className="rounded-xl border border-border py-2.5 text-[12px] font-bold"
                >
                  Show QR
                </button>
                <Link
                  to="/admin/plaques/$id"
                  params={{ id: p.id }}
                  className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold"
                >
                  Manage plaque
                </Link>
              </div>
            </GlassPanel>
          ))}

          <div className="grid grid-cols-2 gap-1.5">
            <Link to="/admin/plaques" className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold">
              Open all in inventory
            </Link>
            {businessId ? (
              <Link
                to="/admin/businesses/$id"
                params={{ id: businessId }}
                className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold"
              >
                Back to {biz?.name ?? "business"}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border border-border py-2.5 text-[12px] font-bold"
              >
                Print this run
              </button>
            )}
          </div>
        </div>
      ) : null}

      {qr ? (
        <QrSheet url={qr.url} title={qr.title} subtitle={biz?.name ?? null} codeLines={qr.lines} onClose={() => setQr(null)} />
      ) : null}
    </div>
  );
}

function Select({
  label: title,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <p className="mb-1 text-[12px] font-semibold text-muted-foreground">{title}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13px]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {label(o)}
          </option>
        ))}
      </select>
    </div>
  );
}
