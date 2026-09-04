import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import { Button, Chip, Label, NfcWaves, Row, useNfcSupport } from "@/components/taplocal/NfcKit";
import { useBusinessTags } from "@/components/taplocal/BizNfc";
import { nfcErrorMessage, readOnce } from "@/lib/nfc-client";
import { parseSmartLink } from "@/lib/smartlink";
import { lookupBySlug } from "@/lib/business-nfc.functions";
import { DESTINATION_LABEL, PLACEMENT_LABEL } from "@/lib/taplocal";

export const Route = createFileRoute("/app/nfc/read")({
  head: () => ({
    meta: [
      { title: "Read an NFC tag — TapLocal" },
      { name: "description", content: "Hold a tag to your phone to see which one it is and where it sends people." },
      { property: "og:title", content: "Read an NFC tag — TapLocal" },
      { property: "og:description", content: "Hold a tag to your phone to see which one it is and where it sends people." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReadPage,
});

type Found = {
  raw: string;
  slug: string | null;
  known: boolean;
  mine: boolean;
  name: string | null;
  code: string | null;
  id: string | null;
  placement: string | null;
  destination: string | null;
};

function ReadPage() {
  const support = useNfcSupport();
  const { tags, businessId } = useBusinessTags();
  const lookup = useServerFn(lookupBySlug);

  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);

  async function handleRead() {
    if (!businessId) return;
    setError(null);
    setFound(null);
    setReading(true);
    try {
      const result = await readOnce();
      const raw = result.url ?? result.records[0]?.value ?? "";
      const parsed = raw ? parseSmartLink(raw) : null;
      if (!parsed) {
        setFound({ raw: raw || "(empty tag)", slug: null, known: false, mine: false, name: null, code: null, id: null, placement: null, destination: null });
        return;
      }
      const res = await lookup({ data: { businessId, slug: parsed.slug } });
      const local = tags.find((t) => t.plaque.public_slug === parsed.slug) ?? null;
      setFound({
        raw,
        slug: parsed.slug,
        known: Boolean(res.ok && (res.plaque || res.belongsToBusiness)),
        mine: Boolean(res.ok && res.belongsToBusiness),
        name: local?.plaque.plaque_name ?? res.plaque?.plaque_name ?? null,
        code: res.plaque?.plaque_code ?? local?.plaque.plaque_code ?? null,
        id: res.plaque?.id ?? local?.plaque.id ?? null,
        placement: res.plaque?.placement_type ?? local?.plaque.placement_type ?? null,
        destination: local?.destination?.destination_type ?? null,
      });
    } catch (e) {
      setError(nfcErrorMessage(e));
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <Link to="/app/nfc" className="text-[13px] font-semibold text-muted-foreground">
          ← NFC Manager
        </Link>
        <h1 className="font-display mt-2 text-[28px] leading-tight font-bold tracking-tight">Read an existing tag</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Hold a tag to your phone and we&apos;ll tell you which one it is.
        </p>
      </header>

      <GlassPanel className="p-5">
        {support && !support.usable ? (
          <p className="text-[13px] text-muted-foreground">
            Reading tags needs an Android phone with Chrome. You can still see all your tags under My NFC Tags.
          </p>
        ) : reading ? (
          <div className="flex items-center gap-4">
            <NfcWaves />
            <p className="text-[15px] font-bold">Hold the tag to your phone…</p>
          </div>
        ) : (
          <Button onClick={handleRead}>Read a tag</Button>
        )}
        {error ? <p className="mt-3 text-[13px] font-semibold text-destructive">{error}</p> : null}
      </GlassPanel>

      {found ? (
        <GlassPanel className="p-5">
          <Label>What we read</Label>
          {found.mine ? (
            <div className="mt-2">
              <Chip tone="ok">One of your tags</Chip>
              <p className="font-display mt-2 text-[22px] font-bold tracking-tight">{found.name ?? found.code}</p>
              <div className="mt-3">
                <Row label="Tag code" value={found.code ?? "—"} />
                <Row label="Where it is" value={found.placement ? (PLACEMENT_LABEL[found.placement] ?? found.placement) : "Not set"} />
                <Row
                  label="Sends people to"
                  value={found.destination ? (DESTINATION_LABEL[found.destination] ?? found.destination) : "Nothing yet"}
                />
                <Row label="On the tag" value={<span className="font-mono break-all">{found.raw}</span>} />
              </div>
              {found.id ? (
                <Link to="/app/nfc/tags/$id" params={{ id: found.id }} className="mt-3 inline-block text-[13px] font-bold text-primary">
                  Manage this tag →
                </Link>
              ) : null}
            </div>
          ) : found.slug ? (
            <div className="mt-2">
              <Chip tone="warn">A TapLocal tag, but not yours</Chip>
              <p className="mt-2 text-[13px] text-muted-foreground">
                This is a TapLocal tag registered to another account. Contact support if you believe it should be on
                yours.
              </p>
            </div>
          ) : (
            <div className="mt-2">
              <Chip tone="bad">Not a TapLocal tag</Chip>
              <p className="mt-2 text-[13px] text-muted-foreground">
                This tag doesn&apos;t hold a TapLocal link. You can set it up as one of your tags.
              </p>
              <p className="mt-2 font-mono text-[12px] break-all text-muted-foreground">{found.raw}</p>
              <Link to="/app/nfc/write" className="mt-3 inline-block text-[13px] font-bold text-primary">
                Set up a tag →
              </Link>
            </div>
          )}
        </GlassPanel>
      ) : null}
    </div>
  );
}
