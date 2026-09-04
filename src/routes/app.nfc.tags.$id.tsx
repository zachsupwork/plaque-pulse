import { createFileRoute, Link } from "@tanstack/react-router";
import { GlassPanel } from "@/components/taplocal/Field";
import { Label, Row } from "@/components/taplocal/NfcKit";
import { StatusChip, TagProgrammer, tagLabel, useBusinessTags } from "@/components/taplocal/BizNfc";
import { DESTINATION_LABEL, PLACEMENT_LABEL } from "@/lib/taplocal";
import { nfcUrl } from "@/lib/smartlink";

export const Route = createFileRoute("/app/nfc/tags/$id")({
  head: () => ({
    meta: [
      { title: "NFC tag details — TapLocal" },
      { name: "description", content: "See where this NFC tag sits, where it sends people and whether it is working." },
      { property: "og:title", content: "NFC tag details — TapLocal" },
      { property: "og:description", content: "See where this NFC tag sits, where it sends people and whether it is working." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TagDetail,
});

function TagDetail() {
  const { id } = Route.useParams();
  const { tags, locations, businessId, isLoading, refetch } = useBusinessTags();
  const tag = tags.find((t) => t.plaque.id === id) ?? null;

  if (isLoading) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  if (!tag) {
    return (
      <div className="space-y-4">
        <Link to="/app/nfc/tags" className="text-[13px] font-semibold text-muted-foreground">
          ← My NFC tags
        </Link>
        <GlassPanel className="p-5">
          <p className="text-[15px] font-bold">We couldn&apos;t find that tag</p>
          <p className="mt-1 text-[13px] text-muted-foreground">It may belong to another account.</p>
        </GlassPanel>
      </div>
    );
  }

  const location = locations.find((l) => l.id === tag.plaque.location_id);

  return (
    <div className="space-y-5">
      <header>
        <Link to="/app/nfc/tags" className="text-[13px] font-semibold text-muted-foreground">
          ← My NFC tags
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">{tagLabel(tag)}</h1>
          <StatusChip tag={tag} />
        </div>
      </header>

      <GlassPanel className="p-4">
        <Label>This tag</Label>
        <div className="mt-2">
          <Row label="Tag code" value={tag.plaque.plaque_code} />
          <Row label="Location" value={location?.name ?? "Not set"} />
          <Row
            label="Where it is"
            value={tag.plaque.placement_type ? (PLACEMENT_LABEL[tag.plaque.placement_type] ?? tag.plaque.placement_type) : "Not set"}
          />
          <Row
            label="Sends people to"
            value={tag.destination ? (DESTINATION_LABEL[tag.destination.destination_type] ?? tag.destination.destination_type) : "Nothing yet"}
          />
          {tag.destination ? <Row label="Web address" value={<span className="font-mono break-all">{tag.destination.url}</span>} /> : null}
          <Row label="Link on the tag" value={<span className="font-mono break-all">{nfcUrl(tag.plaque.public_slug)}</span>} />
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link to="/app/nfc/write" className="text-[13px] font-bold text-primary">
            Change what it does →
          </Link>
          <Link to="/app/nfc/verify" className="text-[13px] font-bold text-primary">
            Check or replace →
          </Link>
        </div>
      </GlassPanel>

      {businessId ? <TagProgrammer businessId={businessId} tag={tag} onDone={() => void refetch()} /> : null}
    </div>
  );
}
