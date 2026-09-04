import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import { Button, Chip, Label } from "@/components/taplocal/NfcKit";
import { StatusChip, TagProgrammer, tagLabel, useBusinessTags } from "@/components/taplocal/BizNfc";
import { replaceTag } from "@/lib/business-nfc.functions";

export const Route = createFileRoute("/app/nfc/verify")({
  head: () => ({
    meta: [
      { title: "Check or replace a tag — TapLocal" },
      { name: "description", content: "Confirm an NFC tag still works, or move its job onto a replacement tag." },
      { property: "og:title", content: "Check or replace a tag — TapLocal" },
      { property: "og:description", content: "Confirm an NFC tag still works, or move its job onto a replacement tag." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { tags, businessId, refetch } = useBusinessTags();
  const swap = useServerFn(replaceTag);

  const [tagId, setTagId] = useState<string | null>(null);
  const [replaceWith, setReplaceWith] = useState<string>("");
  const [swapped, setSwapped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => tags.find((t) => t.plaque.id === tagId) ?? null, [tags, tagId]);
  const spares = tags.filter((t) => t.plaque.id !== tagId);

  async function handleReplace() {
    if (!businessId || !selected || !replaceWith) return;
    setError(null);
    const result = await swap({ data: { businessId, oldPlaqueId: selected.plaque.id, newPlaqueId: replaceWith } });
    if (!result.ok) {
      setError("We couldn't swap those tags. Please try again.");
      return;
    }
    setSwapped(true);
    void refetch();
  }

  return (
    <div className="space-y-5">
      <header>
        <Link to="/app/nfc" className="text-[13px] font-semibold text-muted-foreground">
          ← NFC Manager
        </Link>
        <h1 className="font-display mt-2 text-[28px] leading-tight font-bold tracking-tight">Check or replace a tag</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Hold a tag to your phone to confirm it still works — or swap a damaged one for a new tag.
        </p>
      </header>

      <GlassPanel className="p-4">
        <Label>Which tag?</Label>
        <div className="mt-3 space-y-2">
          {tags.map((t) => (
            <button
              key={t.plaque.id}
              type="button"
              onClick={() => {
                setTagId(t.plaque.id);
                setSwapped(false);
                setReplaceWith("");
              }}
              className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left ${
                tagId === t.plaque.id ? "border-primary bg-primary/10" : "border-border bg-foreground/5"
              }`}
            >
              <span>
                <span className="block text-[14px] font-semibold">{tagLabel(t)}</span>
                <span className="block text-[12px] text-muted-foreground">{t.plaque.plaque_code}</span>
              </span>
              <StatusChip tag={t} />
            </button>
          ))}
        </div>
      </GlassPanel>

      {selected && businessId ? (
        <>
          <TagProgrammer businessId={businessId} tag={selected} verifyOnly onDone={() => void refetch()} />

          <GlassPanel className="p-4">
            <Label>Replace this tag</Label>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Damaged or lost? Pick another tag and we&apos;ll move the name, place and destination over to it. The old
              tag stops being used.
            </p>
            <select
              value={replaceWith}
              onChange={(e) => setReplaceWith(e.target.value)}
              className="mt-3 w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[14px] outline-none"
            >
              <option value="" className="bg-background">
                Choose a replacement tag
              </option>
              {spares.map((t) => (
                <option key={t.plaque.id} value={t.plaque.id} className="bg-background">
                  {tagLabel(t)} ({t.plaque.plaque_code})
                </option>
              ))}
            </select>
            {error ? <p className="mt-2 text-[13px] font-semibold text-destructive">{error}</p> : null}
            <div className="mt-3 flex items-center gap-2">
              <Button variant="danger" onClick={handleReplace} disabled={!replaceWith}>
                Move everything to the new tag
              </Button>
              {swapped ? <Chip tone="ok">Replaced</Chip> : null}
            </div>
          </GlassPanel>
        </>
      ) : null}
    </div>
  );
}
