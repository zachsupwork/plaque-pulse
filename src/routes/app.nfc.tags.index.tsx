import { createFileRoute, Link } from "@tanstack/react-router";
import { GlassPanel } from "@/components/taplocal/Field";
import { StatusChip, tagLabel, useBusinessTags } from "@/components/taplocal/BizNfc";
import { DESTINATION_LABEL, PLACEMENT_LABEL } from "@/lib/taplocal";

export const Route = createFileRoute("/app/nfc/tags/")({
  head: () => ({
    meta: [
      { title: "My NFC tags — TapLocal" },
      { name: "description", content: "Every NFC tag at your business, where it sits and whether it is working." },
      { property: "og:title", content: "My NFC tags — TapLocal" },
      { property: "og:description", content: "Every NFC tag at your business, where it sits and whether it is working." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TagsPage,
});

function TagsPage() {
  const { tags, locations, isLoading } = useBusinessTags();
  const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? "Unassigned";

  return (
    <div className="space-y-5">
      <header>
        <Link to="/app/nfc" className="text-[13px] font-semibold text-muted-foreground">
          ← NFC Manager
        </Link>
        <h1 className="font-display mt-2 text-[28px] leading-tight font-bold tracking-tight">My NFC tags</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {tags.length} {tags.length === 1 ? "tag" : "tags"} across your business.
        </p>
      </header>

      {isLoading ? <p className="text-[13px] text-muted-foreground">Loading…</p> : null}

      <div className="space-y-3">
        {tags.map((tag) => (
          <Link key={tag.plaque.id} to="/app/nfc/tags/$id" params={{ id: tag.plaque.id }} className="block">
            <GlassPanel className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-bold">{tagLabel(tag)}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {locationName(tag.plaque.location_id)}
                    {tag.plaque.placement_type ? ` · ${PLACEMENT_LABEL[tag.plaque.placement_type] ?? tag.plaque.placement_type}` : ""}
                  </p>
                  <p className="mt-1.5 text-[13px]">
                    {tag.destination
                      ? `Sends people to ${DESTINATION_LABEL[tag.destination.destination_type] ?? tag.destination.destination_type}`
                      : "No destination set yet"}
                  </p>
                </div>
                <StatusChip tag={tag} />
              </div>
            </GlassPanel>
          </Link>
        ))}
      </div>
    </div>
  );
}
