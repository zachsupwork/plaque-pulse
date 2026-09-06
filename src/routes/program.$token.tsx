import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import { Button, Label, ProgramPanel, type ProgrammablePlaque } from "@/components/taplocal/NfcKit";
import { SmartlinkHostCheck } from "@/components/taplocal/SmartlinkInfra";
import { completeProgrammingHandoff, resolveProgrammingHandoff } from "@/lib/nfc.functions";
import { qrUrl } from "@/lib/smartlink";

/**
 * Programming handoff: an operator on an iPhone (or any device without Web NFC)
 * hands this short-lived link to a phone that can write the tag. The token only
 * identifies the plaque — the second device still has to be signed in as an
 * admin, and the server re-checks that on every call.
 */
export const Route = createFileRoute("/program/$token")({
  head: () => ({
    meta: [
      { title: "Program this plaque — TapLocal" },
      { name: "description", content: "Finish programming a TapLocal SmartPlaque on an NFC-capable phone." },
      { property: "og:title", content: "Program this plaque — TapLocal" },
      { property: "og:description", content: "Finish programming a TapLocal SmartPlaque on an NFC-capable phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HandoffPage,
});

function HandoffPage() {
  const { token } = Route.useParams();
  const resolve = useServerFn(resolveProgrammingHandoff);
  const complete = useServerFn(completeProgrammingHandoff);

  const handoff = useQuery({
    queryKey: ["nfc-handoff", token],
    queryFn: () => resolve({ data: { token } }),
    retry: false,
  });

  if (handoff.isLoading) return <p className="p-6 text-[13px] text-muted-foreground">Opening this plaque…</p>;

  const data = handoff.data;
  if (!data?.ok || !data.plaque) {
    const reason =
      data?.error === "expired"
        ? "This programming link has expired. Ask for a fresh one from the plaque page."
        : data?.error === "not_found"
          ? "We couldn't find this programming link."
          : "Sign in with your TapLocal admin account on this phone to continue.";
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        <h1 className="font-display text-[22px] font-bold tracking-tight">Programming link</h1>
        <GlassPanel className="p-5">
          <p className="text-[13px] text-muted-foreground">{reason}</p>
          <div className="mt-3 flex gap-2">
            <Link to="/auth" search={{ returnTo: `/program/${token}` }}>
              <Button>Sign in</Button>
            </Link>
            <Link to="/admin">
              <Button variant="ghost">Admin</Button>
            </Link>
          </div>
        </GlassPanel>
      </div>
    );
  }

  const plaque = data.plaque as ProgrammablePlaque;
  const expected = data.expectedUrl ?? "";

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Program {plaque.plaque_code}</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Handed over from another device. Hold the tag against the back of this phone when you press Program NFC.
        </p>
      </div>

      <GlassPanel className="p-4">
        <Label>Link that goes on the tag</Label>
        <p className="mt-1 font-mono text-[13px] break-all text-accent">{expected}</p>
      </GlassPanel>

      <SmartlinkHostCheck urls={[expected, qrUrl(plaque.public_slug)]} />

      <ProgramPanel
        plaque={plaque}
        onVerified={() => void complete({ data: { token, result: "verified" } })}
        continueLabel="Done for now"
      />
    </div>
  );
}
