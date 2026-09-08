import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StatusChip } from "@/components/taplocal/Field";
import { BusinessSearch } from "@/components/taplocal/BusinessSearch";
import { SmartDestinationPicker } from "@/components/taplocal/DestinationDiscovery";
import { CopyButton, QrSheet } from "@/components/taplocal/LinkTools";
import { adminCreateBusinessFromPlace } from "@/lib/admin-discovery.functions";
import {
  assignPlaqueToBusiness,
  plaqueAdminSummary,
  updatePlaqueBasics,
  type PlaqueAdminSummary,
} from "@/lib/plaque-manage.functions";
import { changePlaqueDestination, changePlaquePlacement } from "@/lib/places.functions";
import { recordQrPrint } from "@/lib/qr-lookup.functions";
import {
  DESTINATIONS,
  PLACEMENTS,
  buildDestinationUrl,
  destinationLabel,
  destinationOption,
  type DestinationKind,
} from "@/lib/destinations";

/**
 * The one plaque management surface used on every admin screen that shows a
 * plaque: programming page, plaque record, place page, QR lookup, setup
 * completion. The public slug, NFC link and QR link are never changed here.
 */

type Sheet = "assign" | "destination" | "placement" | "qr" | "more" | null;

export function PlaqueAdminActions({
  plaqueId,
  variant = "full",
  onChanged,
}: {
  plaqueId: string;
  variant?: "full" | "compact";
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const summaryFn = useServerFn(plaqueAdminSummary);
  const [sheet, setSheet] = useState<Sheet>(null);

  const q = useQuery({
    queryKey: ["plaque-admin-summary", plaqueId],
    queryFn: () => summaryFn({ data: { plaqueId } }),
  });
  const s = q.data?.ok ? q.data.summary : null;

  function refresh() {
    void q.refetch();
    void qc.invalidateQueries({ queryKey: ["admin-plaque", plaqueId] });
    void qc.invalidateQueries({ queryKey: ["place-detail"] });
    void qc.invalidateQueries({ queryKey: ["places"] });
    onChanged?.();
  }

  if (q.isLoading) return <p className="text-[13px] text-muted-foreground">Loading plaque…</p>;
  if (!s) return null;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-border bg-card/70 p-4">
        <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Current assignment</p>

        {s.assigned ? (
          <>
            <p className="mt-1 font-display text-[18px] font-bold tracking-tight">{s.businessName}</p>
            <p className="text-[13px] text-muted-foreground">{s.address ?? s.locationName ?? "No address on file"}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatusChip tone="idle">{s.placement ?? "No placement"}</StatusChip>
              <StatusChip tone={s.destinationType ? "brand" : "attention"}>
                {s.destinationType ? destinationLabel(s.destinationType) : "No destination"}
              </StatusChip>
              <StatusChip tone={s.status === "active" ? "ok" : "idle"}>{s.status.replace(/_/g, " ")}</StatusChip>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 font-display text-[18px] font-bold tracking-tight">Unassigned plaque</p>
            <p className="text-[13px] text-muted-foreground">No business currently attached.</p>
          </>
        )}

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {s.assigned ? (
            <>
              {s.placeKey ? (
                <Link
                  to="/admin/places/$placeId"
                  params={{ placeId: s.placeKey }}
                  className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold"
                >
                  Open place
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => setSheet("destination")}
                className="rounded-xl border border-border py-2.5 text-[12px] font-bold"
              >
                Change destination
              </button>
              <button
                type="button"
                onClick={() => setSheet("placement")}
                className="rounded-xl border border-border py-2.5 text-[12px] font-bold"
              >
                Change placement
              </button>
              <Link
                to="/admin/reassign/$plaqueId"
                params={{ plaqueId }}
                className="rounded-xl border border-primary/50 bg-primary/10 py-2.5 text-center text-[12px] font-bold text-primary"
              >
                Reassign
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSheet("assign")}
                className="col-span-2 rounded-xl bg-primary py-3 text-[13px] font-bold text-primary-foreground"
              >
                Assign to business
              </button>
              <Link
                to="/admin/plaques/$id/program"
                params={{ id: plaqueId }}
                className="rounded-xl border border-border py-2.5 text-center text-[12px] font-bold"
              >
                Program NFC
              </Link>
            </>
          )}
          <button type="button" onClick={() => setSheet("qr")} className="rounded-xl border border-border py-2.5 text-[12px] font-bold">
            Show QR
          </button>
          <button type="button" onClick={() => setSheet("more")} className="rounded-xl border border-border py-2.5 text-[12px] font-bold">
            More
          </button>
        </div>

        {s.assigned && s.destinationUrl ? (
          <div className="mt-3 rounded-xl border border-border p-2.5">
            <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Current destination</p>
            <p className="mt-0.5 text-[13px] font-semibold">{destinationLabel(s.destinationType ?? "")}</p>
            <p className="mt-0.5 font-mono text-[11px] break-all text-muted-foreground">{s.destinationUrl}</p>
            <div className="mt-2 flex gap-1.5">
              <CopyButton value={s.destinationUrl} />
              <a
                href={s.destinationUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold"
              >
                Open
              </a>
            </div>
          </div>
        ) : null}
      </section>

      {variant === "full" ? (
        <>
          <section className="rounded-2xl border border-border bg-card/70 p-4">
            <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Identity</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
              <Cell label="Plaque" value={s.plaqueCode} />
              <Cell label="Slug" value={s.slug} />
              <Cell label="NFC" value={`/n/${s.slug}`} />
              <Cell label="QR" value={`/q/${s.slug}`} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <CopyButton value={s.nfcUrl} label="Copy NFC link" />
              <CopyButton value={s.qrUrl} label="Copy QR link" />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              These links are permanent. Changing the business or destination never changes them, so the printed QR and the
              programmed tag stay valid.
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-card/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Batch</p>
              <Link to="/admin/provisioning" className="text-[12px] font-bold text-primary">
                {s.batchId ? "Open batch" : "Add to batch"}
              </Link>
            </div>
            <p className="mt-1 text-[14px] font-semibold">{s.batchId ?? "No batch"}</p>
          </section>

          {s.siblingCount > 0 ? (
            <section className="rounded-2xl border border-border bg-card/70 p-4">
              <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Other plaques here</p>
              <div className="mt-2 space-y-1.5">
                {s.siblings.map((o) => (
                  <Link
                    key={o.id}
                    to="/admin/plaques/$id"
                    params={{ id: o.id }}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-[12px]"
                  >
                    <span className="font-bold">{o.plaqueCode}</span>
                    <span className="truncate text-muted-foreground">
                      {[o.placement, o.destinationType ? destinationLabel(o.destinationType) : null].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                ))}
              </div>
              {s.placeKey ? (
                <Link
                  to="/admin/places/$placeId"
                  params={{ placeId: s.placeKey }}
                  className="mt-2 block rounded-xl border border-border py-2.5 text-center text-[12px] font-bold"
                >
                  View all {s.siblingCount + 1} plaques
                </Link>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {sheet === "assign" ? <AssignSheet summary={s} onClose={() => setSheet(null)} onDone={refresh} /> : null}
      {sheet === "destination" ? <DestinationSheet summary={s} onClose={() => setSheet(null)} onDone={refresh} /> : null}
      {sheet === "placement" ? <PlacementSheet summary={s} onClose={() => setSheet(null)} onDone={refresh} /> : null}
      {sheet === "more" ? <MoreSheet summary={s} onClose={() => setSheet(null)} onPick={(next) => setSheet(next)} /> : null}
      {sheet === "qr" ? <PlaqueQrSheet summary={s} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-2.5 py-1.5">
      <p className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="truncate font-mono text-[11px]">{value}</p>
    </div>
  );
}

function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-background p-4 sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-[18px] font-bold tracking-tight">{title}</p>
            {subtitle ? <p className="text-[12px] text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full px-3 py-1 text-[18px] text-muted-foreground">
            ×
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

/** Destination picker shared by the assign flow and the standalone sheet. */
function DestinationPicker({
  kind,
  setKind,
  value,
  setValue,
}: {
  kind: DestinationKind;
  setKind: (k: DestinationKind) => void;
  value: string;
  setValue: (v: string) => void;
}) {
  const option = destinationOption(kind);
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {DESTINATIONS.map((d) => (
          <button
            key={d.kind}
            type="button"
            onClick={() => setKind(d.kind)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
              kind === d.kind ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      {option.input !== "none" ? (
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={option.placeholder ?? ""}
          className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-3 text-[14px] outline-none focus:border-primary/60"
        />
      ) : (
        <p className="mt-2 text-[12px] text-muted-foreground">
          TapLocal builds this from the business's own Google listing — nothing to type.
        </p>
      )}
    </>
  );
}

function PlacementPicker({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PLACEMENTS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
            value === p ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

/** Search TapLocal and live Google, add the place if it's new, then finish setup. */
function AssignSheet({ summary, onClose, onDone }: { summary: PlaqueAdminSummary; onClose: () => void; onDone: () => void }) {
  const createFn = useServerFn(adminCreateBusinessFromPlace);
  const assignFn = useServerFn(assignPlaqueToBusiness);

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [reusedExisting, setReusedExisting] = useState(false);
  const [kind, setKind] = useState<DestinationKind>("google_review");
  const [value, setValue] = useState("");
  const [placement, setPlacement] = useState("Front Counter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derived = kind === "google_review" || kind === "directions";
  const builtUrl = useMemo(() => (derived ? null : buildDestinationUrl(kind, value)), [kind, value, derived]);
  const ready = Boolean(businessId && placement && (derived || builtUrl));

  async function pickPlace(placeId: string, name: string) {
    setBusy(true);
    setError(null);
    const res = await createFn({ data: { placeId } });
    setBusy(false);
    if (res.ok && res.businessId) {
      setBusinessId(res.businessId);
      setBusinessName(name);
      setReusedExisting(Boolean(res.duplicate));
      return;
    }
    setError("We couldn't add that business right now.");
  }

  const save = useMutation({
    mutationFn: async () => {
      const res = await assignFn({
        data: {
          plaqueId: summary.plaqueId,
          businessId: businessId!,
          placement: placement.slice(0, 40),
          destinationType: destinationOption(kind).dbType,
          destinationUrl: derived ? null : builtUrl,
        },
      });
      if (!res.ok)
        throw new Error(
          res.error === "use_reassign"
            ? "This plaque already belongs to another business — use Reassign."
            : res.error === "no_destination"
              ? "We couldn't build that destination for this business yet."
              : "That didn't save. Nothing was changed.",
        );
      return res;
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Sheet title="Assign to business" subtitle={`${summary.plaqueCode} · ${summary.slug}`} onClose={onClose}>
      {!businessId ? (
        <>
          <BusinessSearch
            busy={busy}
            onPickExisting={(id, name) => {
              setBusinessId(id);
              setBusinessName(name);
              setReusedExisting(true);
            }}
            onPickPlace={(placeId, name) => void pickPlace(placeId, name)}
          />
          <p className="mt-2 text-[12px] text-muted-foreground">
            Search finds businesses already in TapLocal and live results from Google. A brand new place is added here — no need
            to leave this plaque.
          </p>
        </>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-border p-3">
            <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Business</p>
            <p className="text-[15px] font-bold">{businessName}</p>
            <p className="text-[11px] text-muted-foreground">
              {reusedExisting ? "This place is already in TapLocal — reusing it." : "Added to TapLocal from Google."}
            </p>
            <button type="button" onClick={() => setBusinessId(null)} className="mt-1 text-[12px] font-bold text-primary">
              Choose a different business
            </button>
          </div>

          <div>
            <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Action</p>
            <div className="mt-1.5">
              <DestinationPicker kind={kind} setKind={setKind} value={value} setValue={setValue} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Placement</p>
            <div className="mt-1.5">
              <PlacementPicker value={placement} onPick={setPlacement} />
            </div>
          </div>

          <div className="rounded-xl border border-border p-3 text-[12px]">
            <p className="font-bold">Permanent SmartLinks — unchanged ✓</p>
            <p className="font-mono text-[11px] text-muted-foreground">/n/{summary.slug}</p>
            <p className="font-mono text-[11px] text-muted-foreground">/q/{summary.slug}</p>
          </div>

          {error ? <p className="text-[12px] text-destructive">{error}</p> : null}

          <button
            type="button"
            disabled={!ready || save.isPending}
            onClick={() => save.mutate()}
            className="w-full rounded-xl bg-primary py-3.5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Assign & save"}
          </button>
        </div>
      )}
      {error && !businessId ? <p className="mt-2 text-[12px] text-destructive">{error}</p> : null}
    </Sheet>
  );
}

function DestinationSheet({ summary, onClose, onDone }: { summary: PlaqueAdminSummary; onClose: () => void; onDone: () => void }) {
  const destFn = useServerFn(changePlaqueDestination);
  const [kind, setKind] = useState<DestinationKind>(
    (DESTINATIONS.find((d) => d.dbType === summary.destinationType)?.kind ?? "google_review") as DestinationKind,
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const derived = kind === "google_review" || kind === "directions";

  const save = useMutation({
    mutationFn: async () => {
      const url = derived ? "" : (buildDestinationUrl(kind, value) ?? "");
      if (!derived && !url) throw new Error("Enter a valid destination first.");
      const res = await destFn({ data: { plaqueId: summary.plaqueId, destinationType: destinationOption(kind).dbType, url } });
      if (!res.ok) throw new Error(res.error === "not_assigned" ? "Assign this plaque to a business first." : "Could not save.");
      return res;
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Sheet title="Change destination" subtitle="The tag is never rewritten." onClose={onClose}>
      <SmartDestinationPicker
        plaqueId={summary.plaqueId}
        kind={kind}
        setKind={setKind}
        value={value}
        setValue={setValue}
      />
      {error ? <p className="mt-2 text-[12px] text-destructive">{error}</p> : null}
      <button
        type="button"
        disabled={save.isPending}
        onClick={() => save.mutate()}
        className="mt-3 w-full rounded-xl bg-primary py-3.5 text-[14px] font-bold text-primary-foreground disabled:opacity-60"
      >
        {save.isPending ? "Saving…" : "Save destination"}
      </button>
    </Sheet>
  );
}

function PlacementSheet({ summary, onClose, onDone }: { summary: PlaqueAdminSummary; onClose: () => void; onDone: () => void }) {
  const placeFn = useServerFn(changePlaquePlacement);
  const [placement, setPlacement] = useState(summary.placement ?? "Front Counter");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const res = await placeFn({ data: { plaqueId: summary.plaqueId, placement: placement.slice(0, 40) } });
      if (!res.ok) throw new Error(res.error === "not_assigned" ? "Assign this plaque to a business first." : "Could not save.");
      return res;
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Sheet title="Where will this plaque go?" onClose={onClose}>
      <PlacementPicker value={placement} onPick={setPlacement} />
      {error ? <p className="mt-2 text-[12px] text-destructive">{error}</p> : null}
      <button
        type="button"
        disabled={save.isPending}
        onClick={() => save.mutate()}
        className="mt-3 w-full rounded-xl bg-primary py-3.5 text-[14px] font-bold text-primary-foreground disabled:opacity-60"
      >
        {save.isPending ? "Saving…" : "Save placement"}
      </button>
    </Sheet>
  );
}

function PlaqueQrSheet({ summary, onClose }: { summary: PlaqueAdminSummary; onClose: () => void }) {
  const printFn = useServerFn(recordQrPrint);
  return (
    <QrSheet
      url={summary.qrUrl}
      title={summary.plaqueCode}
      subtitle={[summary.businessName ?? "Unassigned", summary.placement].filter(Boolean).join(" · ")}
      codeLines={[summary.businessName ?? "TapLocal", summary.plaqueCode, summary.slug]}
      onPrinted={() => {
        void printFn({
          data: {
            plaqueId: summary.plaqueId,
            encodedUrl: summary.qrUrl,
            ...(summary.batchId ? { batchId: summary.batchId } : {}),
            designName: [summary.businessName, summary.plaqueName, summary.style].filter(Boolean).join(" — ") || "TapLocal",
          },
        });
      }}
      onClose={onClose}
    />
  );
}

function MoreSheet({
  summary,
  onClose,
  onPick,
}: {
  summary: PlaqueAdminSummary;
  onClose: () => void;
  onPick: (sheet: Sheet) => void;
}) {
  const updateFn = useServerFn(updatePlaqueBasics);
  const [note, setNote] = useState<string | null>(null);

  const setStatus = useMutation({
    mutationFn: (status: "active" | "paused" | "faulty" | "retired") => updateFn({ data: { plaqueId: summary.plaqueId, status } }),
    onSuccess: (res) => setNote(res.ok ? "Status updated." : "That change was rejected."),
  });

  return (
    <Sheet title="Manage plaque" subtitle={summary.plaqueCode} onClose={onClose}>
      <div className="space-y-1.5">
        <Link to="/admin/plaques/$id" params={{ id: summary.plaqueId }} className={ITEM}>
          Open plaque record
        </Link>
        <Link to="/admin/plaques/$id/program" params={{ id: summary.plaqueId }} className={ITEM}>
          Programming &amp; verification
        </Link>
        {summary.placeKey ? (
          <Link to="/admin/places/$placeId" params={{ placeId: summary.placeKey }} className={ITEM}>
            Open place
          </Link>
        ) : null}
        <Link to="/admin/reassign/$plaqueId" params={{ plaqueId: summary.plaqueId }} className={ITEM}>
          Assign / reassign business
        </Link>
        <Link to="/admin/analytics" className={ITEM}>
          Analytics
        </Link>
        <button
          type="button"
          onClick={() => onPick("destination")}
          className="block w-full rounded-xl border border-border px-3.5 py-3 text-left text-[13px] font-bold"
        >
          Change destination
        </button>
        <button
          type="button"
          onClick={() => onPick("placement")}
          className="block w-full rounded-xl border border-border px-3.5 py-3 text-left text-[13px] font-bold"
        >
          Change placement
        </button>
        <button
          type="button"
          onClick={() => onPick("qr")}
          className="block w-full rounded-xl border border-border px-3.5 py-3 text-left text-[13px] font-bold"
        >
          Show QR
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-destructive/40 p-3">
        <p className="text-[10px] font-bold tracking-[0.12em] text-destructive uppercase">Careful</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          These change how the plaque behaves in the field. Links and history are kept either way.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {(["active", "paused", "faulty", "retired"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate(s)}
              className={`rounded-lg border py-2 text-[12px] font-bold ${
                summary.status === s ? "border-primary/40 bg-primary/10 text-primary" : "border-border"
              }`}
            >
              Mark {s}
            </button>
          ))}
        </div>
        {note ? <p className="mt-2 text-[12px]">{note}</p> : null}
      </div>
    </Sheet>
  );
}

const ITEM = "block w-full rounded-xl border border-border px-3.5 py-3 text-left text-[13px] font-bold";
