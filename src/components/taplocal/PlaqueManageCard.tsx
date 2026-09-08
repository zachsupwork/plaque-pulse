import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StatusChip } from "@/components/taplocal/Field";
import { CopyButton, LinkRow, QrSheet } from "@/components/taplocal/LinkTools";
import { DESTINATIONS, buildDestinationUrl, destinationLabel, type DestinationKind } from "@/lib/destinations";
import { nfcUrl, qrUrl } from "@/lib/smartlink";
import { PLACEMENT_LABEL } from "@/lib/taplocal";
import { attentionLabel, changePlaqueDestination, changePlaquePlacement } from "@/lib/places.functions";
import { recordQrPrint } from "@/lib/qr-lookup.functions";

export type PlaceePlaque = {
  id: string;
  plaqueCode: string;
  slug: string;
  name: string | null;
  placement: string | null;
  productType: string;
  style: string | null;
  baseType: string | null;
  batchId: string | null;
  status: string;
  activatedAt: string | null;
  writeStatus: string;
  verificationStatus: string;
  destinationType: string | null;
  destinationUrl: string | null;
  today: number;
  days7: number;
  days30: number;
  nfc30: number;
  qr30: number;
  lastInteraction: string | null;
  attention: string[];
};

function when(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

const PLACEMENTS = Object.keys(PLACEMENT_LABEL);

export function PlaqueManageCard({
  plaque,
  placeTitle,
  highlight,
  compact,
}: {
  plaque: PlaceePlaque;
  placeTitle: string;
  highlight?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [editing, setEditing] = useState<"destination" | "placement" | null>(null);
  const [kind, setKind] = useState<DestinationKind>("google_review");
  const [value, setValue] = useState("");
  const [placement, setPlacement] = useState(plaque.placement ?? "");
  const [error, setError] = useState<string | null>(null);

  const qc = useQueryClient();
  const destFn = useServerFn(changePlaqueDestination);
  const placeFn = useServerFn(changePlaquePlacement);
  const printFn = useServerFn(recordQrPrint);

  const saveDestination = useMutation({
    mutationFn: async () => {
      const option = DESTINATIONS.find((d) => d.kind === kind)!;
      let url = "";
      if (option.input !== "none") {
        url = buildDestinationUrl(kind, value) ?? "";
        if (!url) throw new Error("Enter a valid destination first.");
      }
      const res = await destFn({ data: { plaqueId: plaque.id, destinationType: option.dbType, url } });
      if (!res.ok) throw new Error(res.error === "no_destination" ? "No destination could be built." : "Could not save.");
      return res;
    },
    onSuccess: () => {
      setEditing(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["places"] });
      void qc.invalidateQueries({ queryKey: ["place-detail"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const savePlacement = useMutation({
    mutationFn: async () => {
      if (!placement) throw new Error("Choose a placement.");
      const res = await placeFn({ data: { plaqueId: plaque.id, placement } });
      if (!res.ok) throw new Error("Could not save.");
      return res;
    },
    onSuccess: () => {
      setEditing(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["places"] });
      void qc.invalidateQueries({ queryKey: ["place-detail"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const nfc = nfcUrl(plaque.slug);
  const qr = qrUrl(plaque.slug);
  const written = plaque.writeStatus === "written" || plaque.writeStatus === "preprogrammed" || plaque.writeStatus === "verified";

  return (
    <div
      className={`rounded-2xl border p-3.5 ${
        highlight ? "border-primary/45 bg-primary/[0.04]" : "border-border bg-card/70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] font-bold tracking-tight">
            {plaque.name || plaque.plaqueCode}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">
            {[
              plaque.placement ? (PLACEMENT_LABEL[plaque.placement] ?? plaque.placement) : "No placement",
              plaque.productType.replace(/_/g, " "),
              plaque.style,
              plaque.baseType,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {plaque.destinationType ? `→ ${destinationLabel(plaque.destinationType)}` : "No destination set"}
          </p>
        </div>
        <div className="shrink-0 space-y-1 text-right">
          <StatusChip tone={plaque.status === "active" ? "ok" : plaque.status === "faulty" ? "problem" : "idle"}>
            {plaque.status.replace(/_/g, " ")}
          </StatusChip>
          <p className="text-[11px] font-semibold">{plaque.days30} taps / 30d</p>
          <p className="text-[10px] text-muted-foreground">
            NFC {plaque.nfc30} · QR {plaque.qr30}
          </p>
        </div>
      </div>

      {plaque.attention.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {plaque.attention.map((a) => (
            <span key={a} className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
              {attentionLabel(a)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 space-y-1.5">
        <LinkRow title="NFC" url={nfc} tone="nfc" />
        {!compact || open ? <LinkRow title="QR" url={qr} tone="qr" /> : null}
      </div>

      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        <button type="button" onClick={() => setQrOpen(true)} className="rounded-lg border border-border py-2 text-[11px] font-bold">
          QR code
        </button>
        <Link
          to="/admin/plaques/$id/program"
          params={{ id: plaque.id }}
          className="rounded-lg border border-border py-2 text-center text-[11px] font-bold"
        >
          {written ? "Reprogram" : "Program"}
        </Link>
        <Link to="/admin/nfc/verify" className="rounded-lg border border-border py-2 text-center text-[11px] font-bold">
          Verify
        </Link>
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg border border-border py-2 text-[11px] font-bold">
          {open ? "Less" : "Manage"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <Detail label="Plaque ID" value={plaque.plaqueCode} />
            <Detail label="Slug" value={plaque.slug} />
            <Detail label="Batch" value={plaque.batchId ?? "—"} />
            <Detail label="Activated" value={plaque.activatedAt ? new Date(plaque.activatedAt).toLocaleDateString() : "Not activated"} />
            <Detail label="NFC write" value={written ? plaque.writeStatus.replace(/_/g, " ") : "not programmed"} />
            <Detail label="Verification" value={plaque.verificationStatus.replace(/_/g, " ")} />
            <Detail label="Today" value={`${plaque.today} taps`} />
            <Detail label="Last activity" value={when(plaque.lastInteraction)} />
          </div>

          {plaque.destinationUrl ? (
            <div className="rounded-xl border border-border p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Current destination</p>
              <p className="mt-1 break-all font-mono text-[11px]">{plaque.destinationUrl}</p>
              <div className="mt-2 flex gap-1.5">
                <CopyButton value={plaque.destinationUrl} />
                <a
                  href={plaque.destinationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold"
                >
                  Open
                </a>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(editing === "destination" ? null : "destination")}
              className="rounded-lg border border-border py-2 text-[11px] font-bold"
            >
              Change destination
            </button>
            <button
              type="button"
              onClick={() => setEditing(editing === "placement" ? null : "placement")}
              className="rounded-lg border border-border py-2 text-[11px] font-bold"
            >
              Change placement
            </button>
          </div>

          <Link
            to="/admin/reassign/$plaqueId"
            params={{ plaqueId: plaque.id }}
            className="block rounded-lg border border-primary/50 bg-primary/10 py-2 text-center text-[11px] font-bold text-primary"
          >
            Reassign plaque
          </Link>

          {editing === "destination" ? (
            <div className="rounded-xl border border-border p-2.5">
              <p className="text-[11px] text-muted-foreground">
                The plaque is never rewritten — only where the SmartLink sends people changes.
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {DESTINATIONS.map((d) => (
                  <button
                    key={d.kind}
                    type="button"
                    onClick={() => setKind(d.kind)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      kind === d.kind ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {DESTINATIONS.find((d) => d.kind === kind)!.input !== "none" ? (
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={DESTINATIONS.find((d) => d.kind === kind)!.placeholder ?? ""}
                  className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13px] outline-none focus:border-primary/60"
                />
              ) : null}
              <button
                type="button"
                onClick={() => saveDestination.mutate()}
                disabled={saveDestination.isPending}
                className="mt-2 w-full rounded-xl bg-primary py-2.5 text-[12px] font-bold text-primary-foreground disabled:opacity-60"
              >
                {saveDestination.isPending ? "Saving…" : "Save destination"}
              </button>
            </div>
          ) : null}

          {editing === "placement" ? (
            <div className="rounded-xl border border-border p-2.5">
              <div className="flex flex-wrap gap-1">
                {PLACEMENTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlacement(p)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      placement === p ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {PLACEMENT_LABEL[p]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => savePlacement.mutate()}
                disabled={savePlacement.isPending}
                className="mt-2 w-full rounded-xl bg-primary py-2.5 text-[12px] font-bold text-primary-foreground disabled:opacity-60"
              >
                {savePlacement.isPending ? "Saving…" : "Save placement"}
              </button>
            </div>
          ) : null}

          {error ? <p className="text-[11px] text-destructive">{error}</p> : null}

          <Link
            to="/admin/plaques/$id"
            params={{ id: plaque.id }}
            className="block rounded-xl border border-border py-2.5 text-center text-[12px] font-bold"
          >
            Full plaque record →
          </Link>
        </div>
      ) : null}

      {qrOpen ? (
        <QrSheet
          url={qr}
          title={plaque.plaqueCode}
          subtitle={`${placeTitle}${plaque.placement ? ` · ${PLACEMENT_LABEL[plaque.placement] ?? plaque.placement}` : ""}`}
          codeLines={[placeTitle, plaque.plaqueCode, plaque.slug]}
          onPrinted={() => {
            void printFn({
              data: {
                plaqueId: plaque.id,
                encodedUrl: qr,
                ...(plaque.batchId ? { batchId: plaque.batchId } : {}),
                designName: [placeTitle, plaque.name, plaque.style].filter(Boolean).join(" — "),
              },
            });
          }}
          onClose={() => setQrOpen(false)}
        />
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-2.5 py-1.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate font-mono text-[11px]">{value}</p>
    </div>
  );
}
