import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import { Button, Chip, Label, ProgramPanel, type ProgrammablePlaque } from "@/components/taplocal/NfcKit";
import { batchQueue, listBatches } from "@/lib/nfc.functions";

export const Route = createFileRoute("/admin/nfc/batch")({
  head: () => ({
    meta: [
      { title: "Batch Programming — TapLocal NFC Tools" },
      { name: "description", content: "Work through a production batch of SmartPlaques one tag at a time." },
      { property: "og:title", content: "Batch Programming — TapLocal" },
      { property: "og:description", content: "Work through a production batch of SmartPlaques quickly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BatchPage,
});

function BatchPage() {
  const batches = useServerFn(listBatches);
  const queue = useServerFn(batchQueue);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  const batchList = useQuery({ queryKey: ["batches"], queryFn: () => batches({ data: undefined }) });
  const items = useQuery({
    queryKey: ["batch-queue", batchId],
    queryFn: () => queue({ data: { batchId: batchId! } }),
    enabled: Boolean(batchId),
  });

  if (!batchId) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-[24px] font-bold tracking-tight">Batch Programming</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">Pick a batch to work through.</p>
        </div>
        <div className="space-y-2">
          {(batchList.data?.batches ?? []).map((b) => (
            <button key={b.batchId} type="button" className="w-full text-left" onClick={() => setBatchId(b.batchId)}>
              <GlassPanel className="flex items-center justify-between p-4">
                <div>
                  <p className="text-[14px] font-bold">{b.batchId}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {b.programmed} of {b.total} verified
                  </p>
                </div>
                <Chip tone={b.programmed === b.total ? "ok" : "idle"}>
                  {b.programmed === b.total ? "Complete" : "In progress"}
                </Chip>
              </GlassPanel>
            </button>
          ))}
          {batchList.isFetched && (batchList.data?.batches ?? []).length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No batches yet. Create plaques with a batch ID first.</p>
          ) : null}
        </div>
      </div>
    );
  }

  const list = items.data?.items ?? [];
  const current = list[index]?.plaque as ProgrammablePlaque | undefined;
  const done = list.filter((item) => item.verificationStatus === "verified").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-bold tracking-tight">{batchId}</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {done} of {list.length} verified
          </p>
        </div>
        <Button variant="ghost" onClick={() => setBatchId(null)}>
          All batches
        </Button>
      </div>

      <GlassPanel className="p-4">
        <Label>Queue</Label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {list.map((item, i) => (
            <button
              key={item.plaque.id}
              type="button"
              onClick={() => setIndex(i)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                i === index ? "border-primary/50 bg-primary/20 text-foreground" : "border-border bg-foreground/5 text-muted-foreground"
              }`}
            >
              {item.plaque.plaque_code}
              {item.verificationStatus === "verified" ? " ✓" : ""}
            </button>
          ))}
        </div>
      </GlassPanel>

      {current ? (
        <>
          <ProgramPanel
            key={current.id}
            plaque={current}
            onVerified={() => {
              void items.refetch();
              setIndex((i) => Math.min(i + 1, list.length - 1));
            }}
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              Previous
            </Button>
            <Button
              variant="ghost"
              onClick={() => setIndex((i) => Math.min(list.length - 1, i + 1))}
              disabled={index >= list.length - 1}
            >
              Skip / next
            </Button>
          </div>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">This batch has no plaques left to program.</p>
      )}
    </div>
  );
}
