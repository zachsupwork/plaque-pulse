import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import { Button, Chip, Label, ProgramPanel, Row, type ProgrammablePlaque } from "@/components/taplocal/NfcKit";
import { NfcOnboarding, NfcStatusChip } from "@/components/taplocal/NfcReady";
import { PlaquePicker } from "@/components/taplocal/PlaquePicker";
import { createPlaqueForProgramming } from "@/lib/nfc.functions";
import { nfcUrl } from "@/lib/smartlink";

export const Route = createFileRoute("/admin/nfc/write")({
  head: () => ({
    meta: [
      { title: "Write NFC Tag — TapLocal NFC Tools" },
      { name: "description", content: "Select a SmartPlaque and program its permanent SmartLink onto an NFC tag." },
      { property: "og:title", content: "Write NFC Tag — TapLocal" },
      { property: "og:description", content: "Program a SmartPlaque's permanent SmartLink onto an NFC tag." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WritePage,
});

function WritePage() {
  const [plaque, setPlaque] = useState<ProgrammablePlaque | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [activationUrl, setActivationUrl] = useState<string | null>(null);

  const create = useServerFn(createPlaqueForProgramming);
  const [form, setForm] = useState({
    productType: "plaque",
    style: "brushed_steel",
    baseType: "desk_stand",
    batchId: "",
  });

  const createRun = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: (result) => {
      if (result.ok && result.plaque) {
        setPlaque(result.plaque as ProgrammablePlaque);
        setActivationUrl(result.activationUrl);
        setConfirmed(true);
      }
    },
  });

  if (plaque && confirmed) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[24px] font-bold tracking-tight">Ready to Program</h1>
          <Button
            variant="ghost"
            onClick={() => {
              setPlaque(null);
              setConfirmed(false);
              setActivationUrl(null);
            }}
          >
            Change plaque
          </Button>
        </div>
        {activationUrl ? (
          <GlassPanel className="p-4">
            <Label>Owner activation link (shown once — never written to the tag)</Label>
            <p className="mt-1 font-mono text-[12px] break-all text-accent">{activationUrl}</p>
          </GlassPanel>
        ) : null}
        <ProgramPanel plaque={plaque} />
      </div>
    );
  }

  if (plaque) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-[24px] font-bold tracking-tight">Write NFC Tag</h1>
        <GlassPanel className="p-5">
          <Row label="Plaque ID" value={plaque.plaque_code} />
          <Row label="Status" value={<Chip tone="idle">{plaque.status}</Chip>} />
          <Row label="Product" value={plaque.product_type} />
          <Row label="Batch" value={plaque.batch_id ?? "—"} />
          <Row label="Public SmartLink" value={<span className="font-mono">{nfcUrl(plaque.public_slug)}</span>} />
          <Row label="Current owner" value={plaque.business_id ? "Claimed" : "Unclaimed"} />
          <div className="mt-4 flex gap-2">
            <Button onClick={() => setConfirmed(true)}>Continue</Button>
            <Button variant="ghost" onClick={() => setPlaque(null)}>
              Back
            </Button>
          </div>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <NfcOnboarding />
      <NfcStatusChip />
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Write NFC Tag</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Select a plaque to program. Search by plaque ID, public slug or batch ID.
        </p>
      </div>

      <PlaquePicker onSelect={setPlaque} />

      <GlassPanel className="p-5">
        <p className="text-[14px] font-bold">Manufacturing fast path</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Create a brand-new plaque and jump straight into writing its tag.
        </p>
        {showCreate ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {(["productType", "style", "baseType", "batchId"] as const).map((key) => (
                <label key={key} className="block">
                  <span className="text-[12px] text-muted-foreground">{key}</span>
                  <input
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-border bg-foreground/5 px-3 py-2.5 text-[14px] outline-none focus:border-primary/60"
                  />
                </label>
              ))}
            </div>
            <Button onClick={() => createRun.mutate()} disabled={createRun.isPending}>
              {createRun.isPending ? "Creating…" : "Create new plaque & write NFC"}
            </Button>
            {createRun.data && !createRun.data.ok ? (
              <p className="text-[13px] text-destructive">Admin access is required to create plaques.</p>
            ) : null}
          </div>
        ) : (
          <Button className="mt-3" variant="ghost" onClick={() => setShowCreate(true)}>
            Create New Plaque &amp; Write NFC
          </Button>
        )}
      </GlassPanel>
    </div>
  );
}
