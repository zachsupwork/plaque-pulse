import { createFileRoute } from "@tanstack/react-router";
import { GlassPanel } from "@/components/taplocal/Field";
import { Button } from "@/components/taplocal/NfcKit";
import { nfcProgramSchemeLink } from "@/lib/nfc-transport";

/**
 * Universal Link target. When the TapLocal iOS NFC writer is installed, iOS
 * opens the app instead of this page. This page is what an iPhone WITHOUT the
 * app (or a desktop browser) sees, so it must never leak anything — it only
 * knows the opaque token.
 */
export const Route = createFileRoute("/nfc/program/$token")({
  head: () => ({
    meta: [
      { title: "Open TapLocal NFC — TapLocal" },
      { name: "description", content: "Open the TapLocal iPhone NFC writer to program this SmartPlaque." },
      { property: "og:title", content: "Open TapLocal NFC — TapLocal" },
      { property: "og:description", content: "Open the TapLocal iPhone NFC writer to program this SmartPlaque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProgramLaunchPage,
});

function ProgramLaunchPage() {
  const { token } = Route.useParams();
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="font-display text-[22px] font-bold tracking-tight">Program NFC on iPhone</h1>
      <GlassPanel className="p-5">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          TapLocal uses a small iPhone NFC component to securely write this SmartPlaque. If it is installed on this
          phone, it should have opened automatically.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={nfcProgramSchemeLink(token)}>
            <Button>Open TapLocal NFC</Button>
          </a>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          TapLocal NFC for iPhone is not installed yet. Go back to TapLocal and continue the setup — the plaque can
          still be configured and made live, and the tag can be written on an Android phone or with an NFC writing app.
        </p>
      </GlassPanel>
    </div>
  );
}
