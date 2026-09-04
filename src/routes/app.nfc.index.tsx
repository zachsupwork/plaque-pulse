import { createFileRoute, Link } from "@tanstack/react-router";
import { GlassPanel } from "@/components/taplocal/Field";
import { DeviceStatus, useBusinessTags } from "@/components/taplocal/BizNfc";
import { EmbeddedNotice, Label } from "@/components/taplocal/NfcKit";

export const Route = createFileRoute("/app/nfc/")({
  head: () => ({
    meta: [
      { title: "NFC Manager — TapLocal" },
      { name: "description", content: "Set up, check and manage the TapLocal NFC tags at your business." },
      { property: "og:title", content: "NFC Manager — TapLocal" },
      { property: "og:description", content: "Set up, check and manage the TapLocal NFC tags at your business." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NfcHome,
});

const actions = [
  { to: "/app/nfc/write", title: "Set Up New NFC Tag", copy: "Choose what it should do, then hold it to your phone." },
  { to: "/app/nfc/read", title: "Read Existing Tag", copy: "Find out which tag you're holding and where it sends people." },
  { to: "/app/nfc/tags", title: "My NFC Tags", copy: "Every tag at your business and whether it's working." },
  { to: "/app/nfc/verify", title: "Check or Replace a Tag", copy: "Confirm a tag still works, or swap in a new one." },
] as const;

function NfcHome() {
  const { tags, locations, isLoading } = useBusinessTags();

  const countFor = (locationId: string) =>
    tags.filter((t) => t.plaque.location_id === locationId && t.verificationStatus === "verified").length;

  return (
    <div className="space-y-5">
      <EmbeddedNotice />
      <header>
        <h1 className="font-display text-[30px] leading-tight font-bold tracking-tight">NFC Manager</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Set up and manage TapLocal NFC tags at your business.
        </p>
      </header>

      <div className="grid gap-3">
        {actions.map((a) => (
          <Link key={a.to} to={a.to} className="block">
            <GlassPanel className="p-4" sheen>
              <p className="text-[16px] font-bold">{a.title}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{a.copy}</p>
            </GlassPanel>
          </Link>
        ))}
      </div>

      <GlassPanel className="p-4">
        <Label>Your locations</Label>
        {isLoading ? (
          <p className="mt-2 text-[13px] text-muted-foreground">Loading…</p>
        ) : locations.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">No locations yet.</p>
        ) : (
          <ul className="mt-2 space-y-2.5">
            {locations.map((l) => (
              <li key={l.id} className="flex items-center justify-between border-b border-border pb-2.5 last:border-0 last:pb-0">
                <div>
                  <p className="text-[14px] font-semibold">{l.name}</p>
                  {l.city ? <p className="text-[12px] text-muted-foreground">{l.city}</p> : null}
                </div>
                <span className="text-[13px] font-semibold text-accent">
                  {countFor(l.id)} active NFC {countFor(l.id) === 1 ? "tag" : "tags"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>

      <DeviceStatus />
    </div>
  );
}
