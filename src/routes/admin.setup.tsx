import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, Stat, StatusChip } from "@/components/taplocal/Field";
import { BusinessSearch } from "@/components/taplocal/BusinessSearch";
import { NfcOnboarding, NfcStatusChip } from "@/components/taplocal/NfcReady";
import { CopyButton, ProgramPanel, QrImage, type ProgrammablePlaque } from "@/components/taplocal/NfcKit";
import { adminCreateBusinessFromPlace } from "@/lib/admin-discovery.functions";
import { createPlaqueForProgramming } from "@/lib/nfc.functions";
import { BASE_TYPES, PRODUCT_TYPES, STYLES } from "@/lib/admin.functions";
import {
  availableInventory,
  configurePlaque,
  makePlaqueLive,
  plaqueLiveStats,
  workbenchBusiness,
} from "@/lib/workbench.functions";
import {
  buildDestinationUrl,
  DESTINATIONS,
  destinationLabel,
  destinationOption,
  PLACEMENTS,
  safeUrl,
  type DestinationKind,
} from "@/lib/destinations";
import { nfcUrl, qrUrl, testUrl } from "@/lib/smartlink";

export const Route = createFileRoute("/admin/setup")({
  validateSearch: (search: Record<string, unknown>): { businessId?: string } =>
    typeof search["businessId"] === "string" ? { businessId: search["businessId"] as string } : {},

  head: () => ({
    meta: [
      { title: "Set up a SmartPlaque — TapLocal admin" },
      { name: "description", content: "Find a business, choose a plaque and make it live." },
      { property: "og:title", content: "Set up a SmartPlaque — TapLocal admin" },
      { property: "og:description", content: "Find a business, choose a plaque and make it live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetupWorkbench,
});

function label(value: string | null | undefined) {
  return (value ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Section({
  step,
  title,
  done,
  children,
}: {
  step: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold ${
            done ? "bg-accent/20 text-accent" : "bg-primary/10 text-primary"
          }`}
        >
          {done ? "✓" : step}
        </span>
        <h2 className="font-display text-[15px] font-bold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className={`text-[13px] ${ok ? "text-accent" : "text-muted-foreground"}`}>
      {ok ? "✓" : "○"} {children}
    </p>
  );
}

function SetupWorkbench() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const businessFn = useServerFn(workbenchBusiness);
  const createBusinessFn = useServerFn(adminCreateBusinessFromPlace);
  const inventoryFn = useServerFn(availableInventory);
  const createPlaqueFn = useServerFn(createPlaqueForProgramming);
  const configureFn = useServerFn(configurePlaque);
  const liveFn = useServerFn(makePlaqueLive);
  const statsFn = useServerFn(plaqueLiveStats);

  const [businessId, setBusinessId] = useState<string | null>(search.businessId ?? null);
  const [addingPlace, setAddingPlace] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [kind, setKind] = useState<DestinationKind | null>(null);
  const [destValue, setDestValue] = useState("");

  const [plaque, setPlaque] = useState<ProgrammablePlaque | null>(null);
  const [preprogrammed, setPreprogrammed] = useState(false);
  const [plaqueTab, setPlaqueTab] = useState<"inventory" | "new">("inventory");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [newProduct, setNewProduct] = useState<string>(PRODUCT_TYPES[0]);
  const [newStyle, setNewStyle] = useState<string>(STYLES[0]);
  const [newBase, setNewBase] = useState<string>(BASE_TYPES[0]);
  const [creating, setCreating] = useState(false);

  const [placement, setPlacement] = useState<string>("");
  const [customPlacement, setCustomPlacement] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [verified, setVerified] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (search.businessId && search.businessId !== businessId) setBusinessId(search.businessId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.businessId]);

  const business = useQuery({
    queryKey: ["workbench-business", businessId],
    enabled: Boolean(businessId),
    queryFn: () => businessFn({ data: { businessId: businessId! } }),
  });
  const biz = business.data?.ok ? business.data.business : null;
  const location = biz?.locations?.[0] ?? null;

  const inventory = useQuery({
    queryKey: ["workbench-inventory", inventoryQuery],
    enabled: Boolean(businessId) && !plaque,
    queryFn: () => inventoryFn({ data: { query: inventoryQuery } }),
  });

  const stats = useQuery({
    queryKey: ["workbench-stats", plaque?.id, live],
    enabled: Boolean(plaque) && live,
    refetchInterval: 20_000,
    queryFn: () => statsFn({ data: { plaqueId: plaque!.id } }),
  });

  const option = kind ? destinationOption(kind) : null;
  const derived = kind === "google_review" || kind === "directions";
  const builtUrl = useMemo(() => (kind && !derived ? buildDestinationUrl(kind, destValue) : null), [kind, destValue, derived]);
  const destinationReady = Boolean(
    kind && (derived ? Boolean(location?.google_place_id || location?.google_maps_uri) : Boolean(builtUrl)),
  );
  const chosenPlacement = placement === "Other" ? customPlacement.trim() : placement;
  const ready = Boolean(businessId && plaque && destinationReady && chosenPlacement);

  function resetPlaqueFlow() {
    setPlaque(null);
    setPreprogrammed(false);
    setConfigured(false);
    setVerified(false);
    setLive(false);
    setSaveError(null);
  }

  function changeBusiness() {
    setBusinessId(null);
    resetPlaqueFlow();
    navigate({ to: "/admin/setup", search: {} });
  }

  async function pickPlace(placeId: string) {
    setAddingPlace(true);
    setAddError(null);
    const res = await createBusinessFn({ data: { placeId } });
    setAddingPlace(false);
    if (res.ok && res.businessId) {
      setBusinessId(res.businessId);
      navigate({ to: "/admin/setup", search: { businessId: res.businessId } });
      return;
    }
    setAddError("Couldn't add that business right now.");
  }

  async function createPlaque() {
    setCreating(true);
    const res = await createPlaqueFn({
      data: { productType: newProduct, style: newStyle, baseType: newBase },
    });
    setCreating(false);
    if (res.ok && res.plaque) {
      setPlaque(res.plaque as ProgrammablePlaque);
      setPreprogrammed(false);
    }
  }

  async function saveConfiguration() {
    if (!ready || !plaque || !kind) return;
    setSaving(true);
    setSaveError(null);
    const res = await configureFn({
      data: {
        plaqueId: plaque.id,
        businessId: businessId!,
        locationId: location?.id ?? null,
        placement: chosenPlacement.slice(0, 40),
        destinationType: destinationOption(kind).dbType,
        url: derived ? null : builtUrl,
      },
    });
    setSaving(false);
    if (res.ok) {
      setConfigured(true);
      return;
    }
    setSaveError(
      res.error === "already_assigned"
        ? "That plaque already belongs to another business."
        : res.error === "no_destination"
          ? "We couldn't build a destination for that choice."
          : "Couldn't save that right now.",
    );
  }

  async function goLive() {
    if (!plaque) return;
    setSaving(true);
    const res = await liveFn({ data: { plaqueId: plaque.id } });
    setSaving(false);
    if (res.ok) setLive(true);
    else setSaveError("Finish the destination first, then make it live.");
  }

  const s = stats.data?.ok ? stats.data.stats : null;

  return (
    <div className="space-y-7 pb-24">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Set Up a SmartPlaque</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Find a business, choose a plaque and make it live.
        </p>
      </div>

      <NfcOnboarding />
      <NfcStatusChip />

      {/* 1 — Business */}
      <Section step={1} title="Business" done={Boolean(biz)}>
        {!businessId ? (
          <>
            <BusinessSearch onPickExisting={(id) => setBusinessId(id)} onPickPlace={pickPlace} busy={addingPlace} />
            {addingPlace ? <p className="mt-2 text-[12px] text-muted-foreground">Adding to TapLocal…</p> : null}
            {addError ? <p className="mt-2 text-[12px] text-destructive">{addError}</p> : null}
          </>
        ) : (
          <GlassPanel className="p-4">
            {business.isLoading ? <p className="text-[13px] text-muted-foreground">Loading business…</p> : null}
            {biz ? (
              <>
                <p className="font-display text-[17px] font-bold tracking-tight">{biz.name}</p>
                {location ? (
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {[location.address, location.city].filter(Boolean).join(", ")}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {location?.google_rating ? (
                    <StatusChip tone="idle">
                      {location.google_rating} ★ · {location.google_review_count ?? 0} reviews
                    </StatusChip>
                  ) : null}
                  {location?.google_place_id ? <StatusChip tone="ok">Google Place linked</StatusChip> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={changeBusiness}
                    className="rounded-xl border border-border px-3.5 py-2 text-[13px] font-semibold"
                  >
                    Change business
                  </button>
                  <Link
                    to="/admin/businesses/$id"
                    params={{ id: biz.id }}
                    className="rounded-xl border border-border px-3.5 py-2 text-[13px] font-semibold"
                  >
                    Open record
                  </Link>
                </div>
              </>
            ) : null}
          </GlassPanel>
        )}
      </Section>

      {/* 2 — Destination */}
      {biz ? (
        <Section step={2} title="What should customers do?" done={destinationReady}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DESTINATIONS.map((d) => (
              <button
                key={d.kind}
                type="button"
                onClick={() => {
                  setKind(d.kind);
                  setConfigured(false);
                  setDestValue(
                    d.kind === "website" ? (location?.website_url ?? "") : d.kind === "call" ? (location?.phone ?? "") : "",
                  );
                }}
                className={`min-h-[58px] rounded-xl border px-3 py-3 text-left text-[13px] font-bold ${
                  kind === d.kind ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card"
                }`}
              >
                {d.label}
                <span className="mt-0.5 block text-[11px] font-medium text-muted-foreground">{d.hint}</span>
              </button>
            ))}
          </div>

          {kind ? (
            <GlassPanel className="mt-3 p-4">
              {derived ? (
                location?.google_place_id || location?.google_maps_uri ? (
                  <>
                    <p className="text-[14px] font-bold">{destinationLabel(kind)}</p>
                    <p className="text-[13px] text-muted-foreground">{biz.name}</p>
                    <p className="mt-1 text-[13px] font-semibold text-accent">Destination ready ✓</p>
                  </>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    This business has no Google listing linked yet, so we can't build that link automatically. Pick
                    another action or use a custom link.
                  </p>
                )
              ) : (
                <>
                  <label className="text-[12px] font-semibold text-muted-foreground">
                    {option?.input === "handle"
                      ? `${option.label} username or link`
                      : option?.input === "phone"
                        ? "Phone number"
                        : "Paste any link"}
                  </label>
                  <input
                    value={destValue}
                    onChange={(e) => {
                      setDestValue(e.target.value);
                      setConfigured(false);
                    }}
                    placeholder={option?.placeholder}
                    className="mt-1 w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[14px] outline-none focus:border-primary/60"
                  />
                  {destValue && !builtUrl ? (
                    <p className="mt-1 text-[12px] text-destructive">That doesn't look like a valid link.</p>
                  ) : null}
                  {builtUrl ? (
                    <p className="mt-1 truncate text-[12px] text-accent">Destination ready ✓ {builtUrl}</p>
                  ) : null}
                </>
              )}
            </GlassPanel>
          ) : null}
        </Section>
      ) : null}

      {/* 3 — Plaque */}
      {biz && kind ? (
        <Section step={3} title="Choose your plaque" done={Boolean(plaque)}>
          {plaque ? (
            <GlassPanel className="p-4">
              <p className="font-display text-[17px] font-bold tracking-tight">{plaque.plaque_code}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {label(plaque.product_type)} · {plaque.public_slug}
              </p>
              <button
                type="button"
                onClick={resetPlaqueFlow}
                className="mt-3 rounded-xl border border-border px-3.5 py-2 text-[13px] font-semibold"
              >
                Choose a different plaque
              </button>
            </GlassPanel>
          ) : (
            <>
              <div className="flex gap-2">
                {(
                  [
                    ["inventory", "Available inventory"],
                    ["new", "Create new / blank tag"],
                  ] as const
                ).map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPlaqueTab(value)}
                    className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold ${
                      plaqueTab === value ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>

              {plaqueTab === "inventory" ? (
                <div className="mt-3 space-y-2.5">
                  <input
                    value={inventoryQuery}
                    onChange={(e) => setInventoryQuery(e.target.value)}
                    placeholder="Plaque ID, slug or batch"
                    className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[14px] outline-none focus:border-primary/60"
                  />
                  {inventory.isLoading ? <p className="text-[13px] text-muted-foreground">Loading inventory…</p> : null}
                  {inventory.data?.ok && inventory.data.plaques.length === 0 ? (
                    <GlassPanel className="p-4 text-[13px] text-muted-foreground">
                      No unassigned plaques. Create one below.
                    </GlassPanel>
                  ) : null}
                  {(inventory.data?.ok ? inventory.data.plaques : []).map((p) => (
                    <GlassPanel key={p.id} className="p-4">
                      <p className="font-display text-[16px] font-bold tracking-tight">{p.plaque_code}</p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {[label(p.product_type), label(p.style), label(p.base_type)].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        NFC: {p.writeStatus === "programmed" ? "Programmed" : "Not programmed"}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setPlaque(p as ProgrammablePlaque);
                          setPreprogrammed(p.writeStatus === "programmed");
                        }}
                        className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-[13px] font-bold text-primary-foreground"
                      >
                        Use this plaque
                      </button>
                    </GlassPanel>
                  ))}
                </div>
              ) : (
                <GlassPanel className="mt-3 space-y-3 p-4">
                  <p className="text-[13px] text-muted-foreground">
                    Creates a new permanent plaque identity — code, slug and SmartLinks — for a new unit or a blank
                    TapLocal tag.
                  </p>
                  <Select label="Product" value={newProduct} onChange={setNewProduct} options={[...PRODUCT_TYPES]} />
                  <Select label="Style" value={newStyle} onChange={setNewStyle} options={[...STYLES]} />
                  <Select label="Base" value={newBase} onChange={setNewBase} options={[...BASE_TYPES]} />
                  <button
                    type="button"
                    disabled={creating}
                    onClick={createPlaque}
                    className="w-full rounded-xl bg-primary px-4 py-3 text-[13px] font-bold text-primary-foreground disabled:opacity-60"
                  >
                    {creating ? "Creating…" : "Create plaque"}
                  </button>
                </GlassPanel>
              )}
            </>
          )}
        </Section>
      ) : null}

      {/* 4 — Placement */}
      {biz && plaque ? (
        <Section step={4} title="Where will it be?" done={Boolean(chosenPlacement)}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PLACEMENTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPlacement(p);
                  setConfigured(false);
                }}
                className={`min-h-[46px] rounded-xl border px-3 py-2 text-[13px] font-semibold ${
                  placement === p ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card"
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
              placeholder="Where exactly?"
              className="mt-2 w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[14px] outline-none focus:border-primary/60"
            />
          ) : null}
        </Section>
      ) : null}

      {/* 5 — Review */}
      {biz && plaque && kind ? (
        <Section step={5} title="Review" done={configured}>
          <GlassPanel className="space-y-2.5 p-4">
            <Row label="Business" value={biz.name} />
            <Row label="Plaque" value={plaque.plaque_code} />
            <Row label="Action" value={destinationLabel(kind)} />
            <Row label="Placement" value={chosenPlacement || "Not chosen yet"} />
            <Row
              label="Customer destination"
              value={derived ? `${destinationLabel(kind)} page` : (builtUrl ?? "Not set")}
            />
            <Row label="NFC SmartLink" value={nfcUrl(plaque.public_slug)} mono />
            <Row label="QR SmartLink" value={qrUrl(plaque.public_slug)} mono />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <StatusChip tone={configured ? "ok" : ready ? "brand" : "idle"}>
                {configured ? "Setup saved ✓" : ready ? "Ready to save" : "Finish the steps above"}
              </StatusChip>
              {configured ? (
                <StatusChip tone={verified || preprogrammed ? "ok" : "attention"}>
                  {verified
                    ? "NFC verified ✓"
                    : preprogrammed
                      ? "NFC preprogrammed ✓"
                      : "NFC: needs programming"}
                </StatusChip>
              ) : null}
            </div>
            {configured ? (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Saving never needs NFC. You can come back and program the tag later, from any Android phone.
              </p>
            ) : null}
            {saveError ? <p className="text-[12px] text-destructive">{saveError}</p> : null}
            <button
              type="button"
              disabled={!ready || saving}
              onClick={saveConfiguration}
              className="w-full rounded-xl bg-primary px-4 py-3.5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : configured ? "Save again" : "Save setup"}
            </button>
          </GlassPanel>
        </Section>
      ) : null}

      {/* 6 — Program */}
      {configured && plaque ? (
        <Section step={6} title="Program NFC" done={verified || preprogrammed}>
          <GlassPanel className="mb-3 p-4">
            <p className="text-[14px] font-bold">Ready to program {plaque.plaque_code}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Hold the NFC chip near the top or back of your phone. Only the TapLocal SmartLink is written to the tag —
              never the customer destination.
            </p>
            <p className="mt-2 font-mono text-[12px] break-all">{nfcUrl(plaque.public_slug)}</p>
          </GlassPanel>

          <ProgramPanel
            plaque={plaque}
            preprogrammed={preprogrammed}
            onVerified={() => setVerified(true)}
            onContinue={() => void goLive()}
            continueLabel="Continue without programming"
          />

          <GlassPanel className="mt-3 space-y-1 p-4">
            <Check ok={verified}>NFC written</Check>
            <Check ok={verified}>Correct SmartLink</Check>
            <Check ok={verified}>Plaque ID matched</Check>
            <Check ok>QR paired</Check>
            <Check ok>Destination configured</Check>
            <Check ok>Business assigned</Check>
            <Check ok={Boolean(chosenPlacement)}>Placement assigned</Check>
          </GlassPanel>

          {!live ? (
            <button
              type="button"
              disabled={saving}
              onClick={goLive}
              className="mt-3 w-full rounded-2xl bg-primary px-4 py-4 text-[15px] font-bold text-primary-foreground disabled:opacity-60"
            >
              Make plaque live
            </button>
          ) : null}
        </Section>
      ) : null}

      {/* Live monitoring */}
      {live && plaque ? (
        <section>
          <GlassPanel tone="brand" className="p-5">
            <p className="font-display text-[20px] font-bold tracking-tight">Your SmartPlaque is live ✓</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {biz?.name} · {plaque.plaque_code} · {kind ? destinationLabel(kind) : ""} · {chosenPlacement}
            </p>
          </GlassPanel>

          <h2 className="mt-5 mb-2 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            Live monitoring
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            <Stat label="Today" value={s ? s.today : "—"} />
            <Stat label="7 days" value={s ? s.days7 : "—"} />
            <Stat label="30 days" value={s ? s.days30 : "—"} />
            <Stat label="NFC" value={s ? s.nfc : "—"} />
            <Stat label="QR" value={s ? s.qr : "—"} />
          </div>
          <GlassPanel className="mt-2.5 space-y-2 p-4">
            <Row
              label="Last interaction"
              value={s?.lastInteraction ? new Date(s.lastInteraction).toLocaleString() : "None yet"}
            />
            <Row label="Destination" value={s?.destination ? destinationLabel(s.destination.type) : "—"} />
            <Row label="Placement" value={s?.placement ?? chosenPlacement} />
            <div className="flex flex-col items-center gap-2 pt-2">
              <QrImage value={qrUrl(plaque.public_slug)} size={140} />
              <CopyButton value={nfcUrl(plaque.public_slug)} label="Copy NFC link" />
            </div>
          </GlassPanel>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <a
              href={testUrl(nfcUrl(plaque.public_slug))}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[52px] items-center justify-center rounded-2xl border border-border bg-card text-center text-[13px] font-bold"
            >
              Test tap
            </a>
            <button
              type="button"
              onClick={() => {
                setLive(false);
                setConfigured(false);
              }}
              className="min-h-[52px] rounded-2xl border border-border bg-card text-[13px] font-bold"
            >
              Change destination
            </button>
            <Link
              to="/admin/plaques/$id"
              params={{ id: plaque.id }}
              className="flex min-h-[52px] items-center justify-center rounded-2xl border border-border bg-card text-center text-[13px] font-bold"
            >
              View full analytics
            </Link>
            <button
              type="button"
              onClick={resetPlaqueFlow}
              className="min-h-[52px] rounded-2xl bg-primary text-[13px] font-bold text-primary-foreground"
            >
              Set up another plaque
            </button>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            A test tap is tagged as a test, so it never counts as customer activity.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function Row({ label: name, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">{name}</p>
      <p className={`text-[13px] font-semibold ${mono ? "font-mono break-all" : ""}`}>{value}</p>
    </div>
  );
}

function Select({
  label: name,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-muted-foreground">{name}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[14px]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {label(o)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Kept so the safe-URL helper stays in the client bundle for validation. */
void safeUrl;
