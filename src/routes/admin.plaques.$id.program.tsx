import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import {
  Button,
  Chip,
  CopyButton,
  Label,
  ProgramPanel,
  QrImage,
  Row,
  type ProgrammablePlaque,
} from "@/components/taplocal/NfcKit";
import { getPlaqueProgramming } from "@/lib/nfc.functions";
import { nfcUrl, qrUrl, testUrl } from "@/lib/smartlink";

export const Route = createFileRoute("/admin/plaques/$id/program")({
  head: () => ({
    meta: [
      { title: "Program plaque — TapLocal admin" },
      { name: "description", content: "Programming record and NFC writer for a single SmartPlaque." },
      { property: "og:title", content: "Program plaque — TapLocal admin" },
      { property: "og:description", content: "Programming record and NFC writer for a single SmartPlaque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProgramPage,
});

function ProgramPage() {
  const { id } = Route.useParams();
  const lookup = useServerFn(getPlaqueProgramming);
  const record = useQuery({
    queryKey: ["plaque-programming", id],
    queryFn: () => lookup({ data: { plaqueId: id } }),
  });

  if (record.isLoading) return <p className="text-[13px] text-muted-foreground">Loading plaque…</p>;
  if (!record.data?.ok || !record.data.plaque)
    return (
      <p className="text-[13px] text-destructive">
        We couldn't open this plaque. Admin access is required.
      </p>
    );

  const plaque = record.data.plaque as ProgrammablePlaque;
  const programming = record.data.programming;
  const link = nfcUrl(plaque.public_slug);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold tracking-tight">{plaque.plaque_code}</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">{plaque.batch_id ?? "No batch"}</p>
        </div>
        <Link to="/admin/plaques">
          <Button variant="ghost">Inventory</Button>
        </Link>
      </div>

      <GlassPanel className="p-5">
        <Label>Programming record</Label>
        <div className="mt-2">
          <Row label="Status" value={<Chip tone="idle">{plaque.status}</Chip>} />
          <Row
            label="Tag written"
            value={
              programming?.write_status === "programmed" ? (
                <Chip tone="ok">Programmed</Chip>
              ) : programming?.write_status === "manual" ? (
                <Chip tone="warn">Programmed manually</Chip>
              ) : (
                <Chip tone="idle">Not programmed</Chip>
              )
            }
          />
          <Row
            label="Verified"
            value={
              programming?.verification_status === "verified" ? (
                <Chip tone="ok">Verified</Chip>
              ) : programming?.verification_status === "mismatch" ? (
                <Chip tone="bad">Mismatch</Chip>
              ) : (
                <Chip tone="idle">Not verified</Chip>
              )
            }
          />
          <Row label="Programmed at" value={programming?.programmed_at ?? "—"} />
          <Row label="Verified at" value={programming?.verified_at ?? "—"} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="font-mono text-[12px] break-all text-accent">{link}</p>
          <CopyButton value={link} label="Copy link" />
          <Button variant="ghost" onClick={() => window.open(testUrl(link), "_blank", "noopener")}>
            Test link
          </Button>
        </div>
      </GlassPanel>

      <ProgramPanel plaque={plaque} onVerified={() => void record.refetch()} />

      <GlassPanel className="flex flex-col items-center gap-2 p-6">
        <Label>QR code</Label>
        <QrImage value={qrUrl(plaque.public_slug)} />
        <p className="font-mono text-[11px] break-all text-muted-foreground">{qrUrl(plaque.public_slug)}</p>
      </GlassPanel>
    </div>
  );
}
