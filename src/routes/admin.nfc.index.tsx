import { createFileRoute, Link } from "@tanstack/react-router";
import { GlassPanel } from "@/components/taplocal/Field";
import { SupportStatus, useNfcSupport } from "@/components/taplocal/NfcKit";
import { NfcOnboarding, NfcReadyPanel, NfcStatusChip } from "@/components/taplocal/NfcReady";

export const Route = createFileRoute("/admin/nfc/")({
  head: () => ({
    meta: [
      { title: "TapLocal NFC Tools — manufacturing utility" },
      { name: "description", content: "Program, read, verify and test SmartPlaque NFC tags." },
      { property: "og:title", content: "TapLocal NFC Tools" },
      { property: "og:description", content: "Program, read, verify and test SmartPlaque NFC tags." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NfcHome,
});

const ACTIONS = [
  { to: "/admin/nfc/write", label: "Write NFC Tag", hint: "Program a plaque's permanent SmartLink", icon: "✍️" },
  { to: "/admin/nfc/read", label: "Read NFC Tag", hint: "See exactly what a tag contains", icon: "📡" },
  { to: "/admin/nfc/verify", label: "Verify Plaque", hint: "Check plaque ID, NFC and QR all match", icon: "✓" },
  { to: "/admin/nfc/batch", label: "Batch Programming", hint: "Run a full production batch fast", icon: "▦" },
] as const;

function NfcHome() {
  const support = useNfcSupport();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-bold tracking-tight">TapLocal NFC Tools</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Program, read, verify and test SmartPlaque NFC tags.
        </p>
      </div>

      <NfcOnboarding />
      <NfcStatusChip />
      <NfcReadyPanel />

      <div className="grid gap-3 sm:grid-cols-2">
        {ACTIONS.map((action) => (
          <Link key={action.to} to={action.to}>
            <GlassPanel className="h-full p-5" sheen>
              <p className="text-[22px]">{action.icon}</p>
              <p className="mt-2 text-[16px] font-bold">{action.label}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{action.hint}</p>
            </GlassPanel>
          </Link>
        ))}
      </div>

      <SupportStatus support={support} />
    </div>
  );
}
