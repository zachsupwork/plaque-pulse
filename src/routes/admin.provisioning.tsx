import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle } from "@/components/taplocal/Field";
import { SmartlinkHostCheck } from "@/components/taplocal/SmartlinkInfra";
import { BASE_TYPES, PRODUCT_TYPES, STYLES, provisionPlaques } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/provisioning")({
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
  const provision = useServerFn(provisionPlaques);
  const [quantity, setQuantity] = useState(5);
  const [productType, setProductType] = useState<string>(PRODUCT_TYPES[0]);
  const [style, setStyle] = useState<string>(STYLES[0]);
  const [baseType, setBaseType] = useState<string>(BASE_TYPES[0]);
  const [batchId, setBatchId] = useState("");

  const run = useMutation({
    mutationFn: () => provision({ data: { quantity, productType, style, baseType, batchId: batchId || null } }),
  });

  const result = run.data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Manufacturing</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Create blank plaques with their permanent links and one-time activation codes.
        </p>
      </div>

      <SmartlinkHostCheck urls={result?.ok ? result.plaques.flatMap((p) => [p.nfcUrl, p.qrUrl, p.activationUrl]) : []} />

      <GlassPanel className="space-y-2.5 p-4">
        <Select label="Product" value={productType} onChange={setProductType} options={[...PRODUCT_TYPES]} />
        <Select label="Style" value={style} onChange={setStyle} options={[...STYLES]} />
        <Select label="Base" value={baseType} onChange={setBaseType} options={[...BASE_TYPES]} />
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[12px] font-semibold text-muted-foreground">Quantity (1–50)</p>
            <input
              type="number"
              min={1}
              max={50}
              value={quantity}
              onChange={(e) => setQuantity(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13px]"
            />
          </div>
          <div>
            <p className="mb-1 text-[12px] font-semibold text-muted-foreground">Batch ID (optional)</p>
            <input
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              placeholder="2026-01-A"
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13px]"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={run.isPending}
          onClick={() => run.mutate()}
          className="w-full rounded-xl bg-primary px-4 py-3 text-[13px] font-bold text-primary-foreground disabled:opacity-50"
        >
          {run.isPending ? "Creating…" : `Create ${quantity} plaque${quantity === 1 ? "" : "s"}`}
        </button>
      </GlassPanel>

      {result && !result.ok ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[13px] text-destructive">
          That was rejected — sign in again as a TapLocal admin.
        </p>
      ) : null}

      {result?.ok && result.plaques.length > 0 ? (
        <div>
          <SectionTitle>Activation codes — shown once</SectionTitle>
          <GlassPanel className="divide-y divide-border">
            {result.plaques.map((p) => (
              <div key={p.id} className="space-y-1 p-3.5 text-[12px]">
                <p className="font-display text-[15px] font-bold tracking-tight">{p.plaqueCode}</p>
                <p className="font-mono text-[15px] font-bold tracking-[0.18em] text-primary">{p.activationCode}</p>
                <p className="truncate text-muted-foreground">{p.nfcUrl}</p>
                <p className="truncate text-muted-foreground">{p.activationUrl}</p>
              </div>
            ))}
          </GlassPanel>
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-2.5 w-full rounded-xl border border-border bg-foreground/5 px-4 py-2.5 text-[13px] font-bold"
          >
            Print this run
          </button>
        </div>
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
