import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, StatusChip } from "@/components/taplocal/Field";
import { BusinessSearch } from "@/components/taplocal/BusinessSearch";
import { CopyButton, QrSheet } from "@/components/taplocal/LinkTools";
import { useInstagramDiscovery } from "@/components/taplocal/InstagramDiscovery";
import { adminCreateBusinessFromPlace } from "@/lib/admin-discovery.functions";
import { workbenchBusiness } from "@/lib/workbench.functions";
import { reassignContext, reassignPlaque } from "@/lib/reassign.functions";
import {
  DESTINATIONS,
  PLACEMENTS,
  buildDestinationUrl,
  destinationLabel,
  destinationOption,
  type DestinationKind,
} from "@/lib/destinations";
import { testUrl } from "@/lib/smartlink";

export const Route = createFileRoute("/admin/reassign/$plaqueId")({
  head: () => ({
    meta: [
      { title: "Reassign a SmartPlaque — TapLocal admin" },
      { name: "description", content: "Move a printed plaque to another business without reprinting the QR or rewriting the tag." },
      { property: "og:title", content: "Reassign a SmartPlaque — TapLocal admin" },
      { property: "og:description", content: "Move a printed plaque to another business without reprinting the QR or rewriting the tag." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReassignScreen,
});

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "muted" }) {
  return (
    <div className="border-t border-border/60 py-2 first:border-t-0">
      <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">{label}</p>
      <div className={`mt-0.5 text-[14px] font-semibold break-words ${tone === "muted" ? "text-muted-foreground" : ""}`}>{value}</div>
    </div>
  );
}

function ReassignScreen() {
  const { plaqueId } = Route.useParams();
  const navigate = useNavigate();

  const contextFn = useServerFn(reassignContext);
  const reassignFn = useServerFn(reassignPlaque);
  const createBusinessFn = useServerFn(adminCreateBusinessFromPlace);
  const businessFn = useServerFn(workbenchBusiness);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [newBusinessId, setNewBusinessId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [kind, setKind] = useState<DestinationKind | null>(null);
  const [destValue, setDestValue] = useState("");
  const [placement, setPlacement] = useState("");
  const [customPlacement, setCustomPlacement] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const ctxQuery = useQuery({
    queryKey: ["reassign-context", plaqueId],
    queryFn: () => contextFn({ data: { plaqueId } }),
  });
  const ctx = ctxQuery.data?.ok ? ctxQuery.data.context : null;

  const target = useQuery({
    queryKey: ["reassign-business", newBusinessId],
    enabled: Boolean(newBusinessId),
    queryFn: () => businessFn({ data: { businessId: newBusinessId! } }),
  });
  const biz = target.data?.ok ? target.data.business : null;
  const location = useMemo(
    () => biz?.locations?.find((l) => l.id === locationId) ?? biz?.locations?.[0] ?? null,
    [biz, locationId],
  );

  useEffect(() => {
    if (location?.id && location.id !== locationId) setLocationId(location.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.id]);

  // Instagram for the NEW business only — never carried over from the old one.
  const discovery = useInstagramDiscovery(step >= 3 ? newBusinessId : null);
  const autoInstagram = discovery.best && discovery.best.confidence >= 80 ? discovery.best : null;
  useEffect(() => {
    if (kind !== "instagram" || !autoInstagram || destValue.trim()) return;
    setDestValue(autoInstagram.profileUrl);
  }, [kind, autoInstagram, destValue]);

  useEffect(() => {
    if (!kind) return;
    if (kind === "website" && !destValue && location?.website_url) setDestValue(location.website_url);
    if (kind === "call" && !destValue && location?.phone) setDestValue(location.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, location?.id]);

  const derived = kind === "google_review" || kind === "directions";
  const builtUrl = useMemo(() => (kind && !derived ? buildDestinationUrl(kind, destValue) : null), [kind, destValue, derived]);
  const destinationReady = Boolean(kind && (derived ? Boolean(location?.google_place_id || location?.google_maps_uri) : Boolean(builtUrl)));
  const chosenPlacement = placement === "Other" ? customPlacement.trim() : placement;

  const run = useMutation({
    mutationFn: async () => {
      const res = await reassignFn({
        data: {
          plaqueId,
          newBusinessId: newBusinessId!,
          newLocationId: locationId,
          newPlacement: chosenPlacement.slice(0, 40),
          newDestinationType: destinationOption(kind!).dbType,
          newDestinationUrl: derived ? null : builtUrl,
          keepBatch: true,
        },
      });
      if (!res.ok || !res.result) {
        throw new Error(
          res.error === "no_destination"
            ? "We couldn't build that destination for the new business yet."
            : res.error === "bad_location"
              ? "That address doesn't belong to the new business."
              : res.error === "same_business"
                ? "This plaque already belongs to that business."
                : "The reassignment didn't go through. Nothing was changed.",
        );
      }
      return res.result;
    },
  });

  async function pickPlace(placeId: string) {
    setAdding(true);
    setAddError(null);
    const res = await createBusinessFn({ data: { placeId } });
    setAdding(false);
    if (res.ok && res.businessId) {
      setNewBusinessId(res.businessId);
      setLocationId(null);
      setStep(2);
      return;
    }
    setAddError("Couldn't add that business right now.");
  }

  if (ctxQuery.isLoading) return <p className="p-4 text-[13px] text-muted-foreground">Loading plaque…</p>;
  if (!ctx)
    return (
      <GlassPanel className="p-4">
        <p className="text-[14px] font-semibold">We couldn't open that plaque.</p>
        <Link to="/admin/qr-lookup" className="mt-2 inline-block text-[13px] font-bold text-primary">
          Find a QR instead →
        </Link>
      </GlassPanel>
    );

  const done = run.data;

  if (done) {
    return (
      <div className="space-y-4">
        <GlassPanel className="p-4" tone="brand">
          <StatusChip tone="ok">Reassigned ✓</StatusChip>
          <h1 className="mt-2 font-display text-[22px] font-bold tracking-tight">{done.plaqueCode}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Now assigned to</p>
          <p className="text-[16px] font-bold">{done.businessName}</p>
          {done.address ? <p className="text-[13px] text-muted-foreground">{done.address}</p> : null}
          <div className="mt-3">
            <Row label="Slug" value={done.slug} />
            <Row label="QR" value={done.qrUrl} />
            <Row label="NFC" value={done.nfcUrl} />
            <Row label="Destination" value={destinationLabel(done.destinationType)} />
            <Row label="Placement" value={done.placement} />
          </div>
        </GlassPanel>

        <div className="grid grid-cols-2 gap-1.5">
          <Link
            to="/admin/places/$placeId"
            params={{ placeId: done.placeKey }}
            className="rounded-xl bg-primary py-3 text-center text-[13px] font-bold text-primary-foreground"
          >
            Open new place
          </Link>
          <button type="button" onClick={() => setQrOpen(true)} className="rounded-xl border border-border py-3 text-[13px] font-bold">
            Show QR
          </button>
          <a
            href={testUrl(done.slug)}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-border py-3 text-center text-[13px] font-bold"
          >
            Test link
          </a>
          <button
            type="button"
            onClick={() => navigate({ to: "/admin/qr-lookup" })}
            className="rounded-xl border border-border py-3 text-[13px] font-bold"
          >
            Reassign another
          </button>
        </div>

        {qrOpen ? (
          <QrSheet
            url={done.qrUrl}
            title={done.plaqueCode}
            subtitle={done.businessName}
            codeLines={[done.businessName, done.plaqueCode, done.slug]}
            onClose={() => setQrOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16">
      <div>
        <h1 className="font-display text-[22px] font-bold tracking-tight">Reassign SmartPlaque</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          The printed QR and NFC SmartLink stay the same. Only the business, placement and destination change.
        </p>
      </div>

      <GlassPanel className="p-4">
        <Row label="Plaque" value={ctx.plaqueCode} />
        <Row label="Slug" value={ctx.slug} />
        <Row label="Current business" value={ctx.currentBusinessName ?? "Unassigned"} />
        <Row label="Current placement" value={ctx.currentPlacement ?? "—"} tone="muted" />
        <Row label="Permanent QR" value={`/q/${ctx.slug}`} tone="muted" />
        <Row label="Permanent NFC" value={`/n/${ctx.slug}`} tone="muted" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          <StatusChip tone="ok">QR reusable ✓</StatusChip>
          <StatusChip tone={ctx.nfcRewriteRequired ? "attention" : "ok"}>
            {ctx.nfcRewriteRequired ? "NFC carries a wrong link ⚠" : "NFC rewrite not required ✓"}
          </StatusChip>
          <StatusChip tone={ctx.designReusable ? "ok" : "attention"}>
            {ctx.designReusable ? "Design reusable ✓" : "Branded artwork needs reprint ⚠"}
          </StatusChip>
          {ctx.batchId ? <StatusChip tone="idle">Batch {ctx.batchId}{ctx.batchPosition ? ` #${ctx.batchPosition}` : ""}</StatusChip> : null}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">{ctx.designNote}</p>
      </GlassPanel>

      {ctx.customerManaged ? (
        <GlassPanel className="p-4" tone="signal">
          <p className="text-[13px] font-bold text-warning">Customer-managed plaque</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {ctx.currentBusinessName} has {ctx.ownerCount} owner account{ctx.ownerCount === 1 ? "" : "s"}. Reassigning removes this
            physical plaque from their active installation. Their account and their past results are untouched.
          </p>
        </GlassPanel>
      ) : null}

      {/* STEP 1 — find the new business */}
      {step === 1 ? (
        <GlassPanel className="p-4">
          <p className="mb-2 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Step 1 · Find new business</p>
          <BusinessSearch
            busy={adding}
            onPickExisting={(id) => {
              setNewBusinessId(id);
              setLocationId(null);
              setStep(2);
            }}
            onPickPlace={(placeId) => void pickPlace(placeId)}
          />
          {adding ? <p className="mt-2 text-[12px] text-muted-foreground">Adding this place to TapLocal…</p> : null}
          {addError ? <p className="mt-2 text-[12px] text-destructive">{addError}</p> : null}
        </GlassPanel>
      ) : null}

      {/* STEP 2 — confirm the new place */}
      {step === 2 ? (
        <GlassPanel className="p-4">
          <p className="mb-2 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Step 2 · Move this plaque to</p>
          {target.isLoading ? <p className="text-[13px] text-muted-foreground">Loading business…</p> : null}
          {biz ? (
            <>
              <p className="text-[17px] font-bold">{biz.name}</p>
              <p className="text-[13px] text-muted-foreground">{location?.address ?? "No address on file"}</p>
              {location?.google_place_id ? (
                <p className="mt-1 text-[11px] break-all text-muted-foreground">Google Place ID: {location.google_place_id}</p>
              ) : null}
              {(biz.locations?.length ?? 0) > 1 ? (
                <select
                  value={locationId ?? ""}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px]"
                >
                  {biz.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {[l.name, l.city].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </select>
              ) : null}
              <p className="mt-3 text-[12px] text-muted-foreground">Current plaque: {ctx.plaqueCode}</p>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => setStep(3)} className="rounded-xl bg-primary py-3 text-[13px] font-bold text-primary-foreground">
                  Continue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewBusinessId(null);
                    setStep(1);
                  }}
                  className="rounded-xl border border-border py-3 text-[13px] font-bold"
                >
                  Change business
                </button>
              </div>
            </>
          ) : null}
        </GlassPanel>
      ) : null}

      {/* STEP 3 — new destination */}
      {step === 3 ? (
        <GlassPanel className="p-4">
          <p className="mb-2 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Step 3 · What should customers do?</p>
          <div className="grid grid-cols-2 gap-1.5">
            {DESTINATIONS.map((d) => (
              <button
                key={d.kind}
                type="button"
                onClick={() => {
                  setKind(d.kind);
                  setDestValue("");
                }}
                className={`rounded-xl border px-3 py-3 text-left text-[13px] font-bold ${
                  kind === d.kind ? "border-primary bg-primary/10 text-primary" : "border-border"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {kind && destinationOption(kind).input !== "none" ? (
            <input
              value={destValue}
              onChange={(e) => setDestValue(e.target.value)}
              placeholder={destinationOption(kind).placeholder ?? ""}
              className="mt-3 w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[15px]"
            />
          ) : null}
          {kind === "instagram" && discovery.loading ? (
            <p className="mt-2 text-[12px] text-muted-foreground">Looking up {biz?.name}'s Instagram…</p>
          ) : null}
          {kind === "google_review" && !location?.google_place_id && !location?.google_maps_uri ? (
            <p className="mt-2 text-[12px] text-warning">No Google listing on file for this business yet — pick another action.</p>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={!destinationReady}
              onClick={() => setStep(4)}
              className="rounded-xl bg-primary py-3 text-[13px] font-bold text-primary-foreground disabled:opacity-50"
            >
              Continue
            </button>
            <button type="button" onClick={() => setStep(2)} className="rounded-xl border border-border py-3 text-[13px] font-bold">
              Back
            </button>
          </div>
        </GlassPanel>
      ) : null}

      {/* STEP 4 — new placement */}
      {step === 4 ? (
        <GlassPanel className="p-4">
          <p className="mb-2 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Step 4 · Where will this plaque go?</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PLACEMENTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlacement(p)}
                className={`rounded-xl border px-3 py-3 text-left text-[13px] font-bold ${
                  placement === p ? "border-primary bg-primary/10 text-primary" : "border-border"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {placement === "Other" ? (
            <input
              value={customPlacement}
              onChange={(e) => setCustomPlacement(e.target.value)}
              placeholder="Describe the spot"
              className="mt-3 w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[15px]"
            />
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={!chosenPlacement}
              onClick={() => setStep(5)}
              className="rounded-xl bg-primary py-3 text-[13px] font-bold text-primary-foreground disabled:opacity-50"
            >
              Review
            </button>
            <button type="button" onClick={() => setStep(3)} className="rounded-xl border border-border py-3 text-[13px] font-bold">
              Back
            </button>
          </div>
        </GlassPanel>
      ) : null}

      {/* STEP 5 — review and confirm */}
      {step === 5 ? (
        <GlassPanel className="p-4">
          <p className="mb-2 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Step 5 · Reassignment review</p>
          <Row label="Plaque" value={ctx.plaqueCode} />
          <Row label="Slug" value={ctx.slug} />
          <Row label="Old business" value={ctx.currentBusinessName ?? "Unassigned"} />
          <Row label="New business" value={biz?.name ?? "—"} />
          <Row label="New destination" value={kind ? destinationLabel(kind) : "—"} />
          <Row label="New placement" value={chosenPlacement} />
          <Row label="NFC" value={`/n/${ctx.slug}`} tone="muted" />
          <Row label="QR" value={`/q/${ctx.slug}`} tone="muted" />
          <div className="mt-3 flex flex-wrap gap-1.5">
            <StatusChip tone="ok">NFC rewrite required: No ✓</StatusChip>
            <StatusChip tone="ok">QR reprint required: No ✓</StatusChip>
            {ctx.designReusable ? null : <StatusChip tone="attention">Design needs update ⚠</StatusChip>}
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Past taps stay with {ctx.currentBusinessName ?? "the previous business"}. New taps count for {biz?.name}.
          </p>

          {run.isError ? <p className="mt-2 text-[12px] text-destructive">{(run.error as Error).message}</p> : null}

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-xl bg-primary py-3 text-[13px] font-bold text-primary-foreground"
            >
              Confirm reassignment
            </button>
            <button type="button" onClick={() => setStep(4)} className="rounded-xl border border-border py-3 text-[13px] font-bold">
              Back
            </button>
          </div>
        </GlassPanel>
      ) : null}

      {ctx.history.length ? (
        <GlassPanel className="p-4">
          <p className="mb-2 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Lifetime hardware history</p>
          {ctx.history.map((h) => (
            <Row
              key={h.businessId ?? "none"}
              label={h.businessName}
              value={`${h.interactions} interaction${h.interactions === 1 ? "" : "s"}${
                h.first ? ` · ${new Date(h.first).toLocaleDateString()} – ${new Date(h.last!).toLocaleDateString()}` : ""
              }`}
            />
          ))}
        </GlassPanel>
      ) : null}

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/60 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-4">
            <p className="font-display text-[18px] font-bold">Reassign {ctx.plaqueCode}?</p>
            <p className="mt-2 text-[13px] text-muted-foreground">
              From <span className="font-bold text-foreground">{ctx.currentBusinessName ?? "Unassigned"}</span> to{" "}
              <span className="font-bold text-foreground">{biz?.name}</span>. The permanent QR and NFC links remain the same.
            </p>
            {ctx.customerManaged ? (
              <p className="mt-2 text-[12px] font-semibold text-warning">
                This plaque belongs to a business with owner access. It will leave their active installation.
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => setConfirming(false)} className="rounded-xl border border-border py-3 text-[13px] font-bold">
                Cancel
              </button>
              <button
                type="button"
                disabled={run.isPending}
                onClick={() => {
                  setConfirming(false);
                  run.mutate();
                }}
                className="rounded-xl bg-primary py-3 text-[13px] font-bold text-primary-foreground disabled:opacity-60"
              >
                {run.isPending ? "Working…" : "Yes, reassign"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <Link to="/admin/plaques/$id" params={{ id: plaqueId }} className="text-[13px] font-bold text-primary">
          ← Open plaque record
        </Link>
        <CopyButton value={ctx.qrUrl} label="Copy QR link" className="rounded-xl border border-border px-3 py-2 text-[12px] font-bold" />
      </div>
    </div>
  );
}
