import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import { Button, Chip, Label } from "@/components/taplocal/NfcKit";
import { StatusChip, TagProgrammer, tagLabel, useBusinessTags } from "@/components/taplocal/BizNfc";
import { setUpTag } from "@/lib/business-nfc.functions";
import { PLACEMENT_LABEL } from "@/lib/taplocal";

export const Route = createFileRoute("/app/nfc/write")({
  head: () => ({
    meta: [
      { title: "Set up an NFC tag — TapLocal" },
      { name: "description", content: "Tell TapLocal what your NFC tag should do, then program it in seconds." },
      { property: "og:title", content: "Set up an NFC tag — TapLocal" },
      { property: "og:description", content: "Tell TapLocal what your NFC tag should do, then program it in seconds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WritePage,
});

const PURPOSES = [
  { key: "google_review", label: "Get Google reviews", hint: "Sends customers straight to your Google review box." },
  { key: "instagram", label: "Grow Instagram followers", hint: "Opens your Instagram profile." },
  { key: "menu", label: "Show the menu", hint: "Opens your menu or price list." },
  { key: "booking", label: "Take bookings", hint: "Opens your booking page." },
  { key: "coupon", label: "Give an offer", hint: "Opens a coupon or promotion page." },
  { key: "website", label: "Send people to my website", hint: "Opens your main website." },
  { key: "custom", label: "Something else", hint: "Any link you choose." },
] as const;

const PLACEMENTS = ["front_counter", "checkout", "table", "reception", "entrance", "exit", "bar", "waiting_area", "hotel_room", "vehicle", "other"];

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[14px] outline-none placeholder:text-muted-foreground focus:border-primary"
    />
  );
}

function WritePage() {
  const { tags, locations, businessId, refetch } = useBusinessTags();
  const save = useServerFn(setUpTag);

  const [tagId, setTagId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [placement, setPlacement] = useState<string>("front_counter");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => tags.find((t) => t.plaque.id === tagId) ?? null, [tags, tagId]);

  async function handleSave() {
    if (!businessId || !selected || !purpose) return;
    setError(null);
    let safeUrl = url.trim();
    if (safeUrl && !/^https?:\/\//i.test(safeUrl)) safeUrl = `https://${safeUrl}`;
    try {
      new URL(safeUrl);
    } catch {
      setError("That doesn't look like a valid web address.");
      return;
    }
    const result = await save({
      data: {
        businessId,
        plaqueId: selected.plaque.id,
        plaqueName: name.trim() || undefined,
        placementType: placement,
        locationId: locationId,
        destinationType: purpose as "custom",
        url: safeUrl,
      },
    });
    if (!result.ok) {
      setError("We couldn't save that. Please try again.");
      return;
    }
    setSaved(true);
    void refetch();
  }

  return (
    <div className="space-y-5">
      <header>
        <Link to="/app/nfc" className="text-[13px] font-semibold text-muted-foreground">
          ← NFC Manager
        </Link>
        <h1 className="font-display mt-2 text-[28px] leading-tight font-bold tracking-tight">Set up an NFC tag</h1>
      </header>

      <GlassPanel className="p-4">
        <Label>Step 1 — Which tag?</Label>
        <div className="mt-3 space-y-2">
          {tags.map((t) => (
            <button
              key={t.plaque.id}
              type="button"
              onClick={() => {
                setTagId(t.plaque.id);
                setName(t.plaque.plaque_name ?? "");
                setPlacement(t.plaque.placement_type ?? "front_counter");
                setLocationId(t.plaque.location_id);
                setSaved(false);
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
          {tags.length === 0 ? <p className="text-[13px] text-muted-foreground">No tags on your account yet.</p> : null}
        </div>
      </GlassPanel>

      {selected ? (
        <GlassPanel className="p-4">
          <Label>Step 2 — What do you want this NFC tag to do?</Label>
          <div className="mt-3 space-y-2">
            {PURPOSES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setPurpose(p.key);
                  setSaved(false);
                }}
                className={`block w-full rounded-xl border px-3.5 py-3 text-left ${
                  purpose === p.key ? "border-primary bg-primary/10" : "border-border bg-foreground/5"
                }`}
              >
                <span className="block text-[14px] font-semibold">{p.label}</span>
                <span className="block text-[12px] text-muted-foreground">{p.hint}</span>
              </button>
            ))}
          </div>
        </GlassPanel>
      ) : null}

      {selected && purpose ? (
        <GlassPanel className="p-4">
          <Label>Step 3 — Where should it send people?</Label>
          <div className="mt-3 space-y-3">
            <TextInput value={url} onChange={setUrl} placeholder="https://…" />
            <div>
              <p className="mb-1.5 text-[12px] text-muted-foreground">Give this tag a name you&apos;ll recognise</p>
              <TextInput value={name} onChange={setName} placeholder="Front counter tag" />
            </div>
            <div>
              <p className="mb-1.5 text-[12px] text-muted-foreground">Where is it?</p>
              <select
                value={placement}
                onChange={(e) => setPlacement(e.target.value)}
                className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[14px] outline-none"
              >
                {PLACEMENTS.map((p) => (
                  <option key={p} value={p} className="bg-background">
                    {PLACEMENT_LABEL[p] ?? p}
                  </option>
                ))}
              </select>
            </div>
            {locations.length ? (
              <div>
                <p className="mb-1.5 text-[12px] text-muted-foreground">Which location?</p>
                <select
                  value={locationId ?? ""}
                  onChange={(e) => setLocationId(e.target.value || null)}
                  className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[14px] outline-none"
                >
                  <option value="" className="bg-background">
                    Not set
                  </option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id} className="bg-background">
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {error ? <p className="text-[13px] font-semibold text-destructive">{error}</p> : null}
            <div className="flex items-center gap-2">
              <Button onClick={handleSave} disabled={!url.trim()}>
                Save this tag
              </Button>
              {saved ? <Chip tone="ok">Saved</Chip> : null}
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              We never write this address onto the tag. The tag carries a permanent TapLocal link, so you can change
              the destination later without touching it.
            </p>
          </div>
        </GlassPanel>
      ) : null}

      {selected && saved && businessId ? (
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Step 4 — Program the tag
          </p>
          <TagProgrammer businessId={businessId} tag={selected} onDone={() => void refetch()} />
        </div>
      ) : null}
    </div>
  );
}
