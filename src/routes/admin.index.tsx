import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import { provisionPlaques } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Plaque provisioning — TapLocal admin" },
      { name: "description", content: "Create blank SmartPlaques and their one-time activation links." },
      { property: "og:title", content: "Plaque provisioning — TapLocal admin" },
      { property: "og:description", content: "Create blank SmartPlaques and activation links." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const provision = useServerFn(provisionPlaques);
  const [quantity, setQuantity] = useState(5);
  const [productType, setProductType] = useState("plaque");
  const [style, setStyle] = useState("brushed_steel");
  const [baseType, setBaseType] = useState("desk_stand");

  const run = useMutation({
    mutationFn: () => provision({ data: { quantity, productType, style, baseType } }),
  });

  return (
    <div>
      <h1 className="font-display text-[26px] font-bold tracking-tight">Plaque provisioning</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-pretty text-muted-foreground">
        Creates blank plaques with a public slug and a single-use activation link. Admin accounts only.
      </p>

      <GlassPanel className="mt-5 p-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Input label="Quantity" value={String(quantity)} onChange={(v) => setQuantity(Number(v) || 1)} />
          <Input label="Product" value={productType} onChange={setProductType} />
          <Input label="Style" value={style} onChange={setStyle} />
          <Input label="Base" value={baseType} onChange={setBaseType} />
        </div>
        <button
          type="button"
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="mt-4 rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground disabled:opacity-50"
        >
          {run.isPending ? "Creating…" : "Create plaques"}
        </button>

        {run.data && !run.data.ok ? (
          <p className="mt-3 text-[13px] text-destructive">
            {run.data.error === "forbidden" || run.data.error === "unauthorized"
              ? "You need an admin account to provision plaques."
              : "Something went wrong."}
          </p>
        ) : null}

        {run.data?.ok && run.data.plaques.length > 0 ? (
          <div className="mt-5 space-y-2">
            {run.data.plaques.map((p) => (
              <div key={p.plaqueCode} className="rounded-xl border border-border bg-foreground/5 p-3.5 text-[13px]">
                <p className="font-semibold">{p.plaqueCode}</p>
                <p className="mt-1 text-muted-foreground">
                  Public slug {p.publicSlug} · tap URL /n/{p.publicSlug}
                </p>
                <p className="mt-1 font-mono text-[12px] break-all text-accent">{p.activationUrl}</p>
              </div>
            ))}
            <p className="text-[12px] text-muted-foreground">
              Activation links are shown once. Print them with the plaque and they stop working after setup.
            </p>
          </div>
        ) : null}
      </GlassPanel>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border bg-foreground/5 px-3 py-2.5 text-[14px] outline-none focus:border-primary/60"
      />
    </label>
  );
}
