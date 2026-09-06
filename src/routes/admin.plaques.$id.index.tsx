import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, Stat, StatusChip } from "@/components/taplocal/Field";
import { getPlaqueRecord, listAllBusinesses } from "@/lib/admin-data.functions";
import { assignPlaque, setPlaqueDestination, setPlaqueStatus } from "@/lib/admin.functions";
import { DESTINATION_LABEL, PLACEMENT_LABEL } from "@/lib/taplocal";
import { nfcUrl, qrUrl } from "@/lib/smartlink";
import { NfcPlaquePanel } from "@/components/taplocal/NfcPlaquePanel";

export const Route = createFileRoute("/admin/plaques/$id/")({
  head: () => ({
    meta: [
      { title: "Plaque record — TapLocal admin" },
      { name: "description", content: "Programming, ownership, destination and tap history for one SmartPlaque." },
      { property: "og:title", content: "Plaque record — TapLocal admin" },
      { property: "og:description", content: "Programming, ownership, destination and tap history for one SmartPlaque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlaqueRecord,
});

const STATUS_OPTIONS = ["inventory", "packed", "sold", "active", "paused", "faulty", "replaced", "retired"] as const;

function PlaqueRecord() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const recordFn = useServerFn(getPlaqueRecord);
  const businessesFn = useServerFn(listAllBusinesses);
  const assignFn = useServerFn(assignPlaque);
  const statusFn = useServerFn(setPlaqueStatus);
  const destinationFn = useServerFn(setPlaqueDestination);

  const q = useQuery({ queryKey: ["admin-plaque", id], queryFn: () => recordFn({ data: { plaqueId: id } }) });
  const businesses = useQuery({
    queryKey: ["admin-businesses", "", "all"],
    queryFn: () => businessesFn({ data: { query: "", filter: "all" as const } }),
  });

  const [businessId, setBusinessId] = useState("");
  const [placement, setPlacement] = useState("");
  const [plaqueName, setPlaqueName] = useState("");
  const [destType, setDestType] = useState("google_review");
  const [destUrl, setDestUrl] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-plaque", id] });
    void qc.invalidateQueries({ queryKey: ["admin-plaques"] });
  };

  const assign = useMutation({
    mutationFn: () =>
      assignFn({
        data: {
          plaqueId: id,
          businessId,
          placementType: placement || null,
          plaqueName: plaqueName || null,
        },
      }),
    onSuccess: (res) => {
      setNote(res.ok ? "Plaque assigned." : "That didn't save — check you're still signed in as admin.");
      refresh();
    },
  });

  const changeStatus = useMutation({
    mutationFn: (status: (typeof STATUS_OPTIONS)[number]) => statusFn({ data: { plaqueId: id, status } }),
    onSuccess: (res) => {
      setNote(res.ok ? "Status updated." : "Status change was rejected.");
      refresh();
    },
  });

  const setDestination = useMutation({
    mutationFn: () => destinationFn({ data: { plaqueId: id, destinationType: destType, url: destUrl } }),
    onSuccess: (res) => {
      setNote(res.ok ? "Destination updated." : "Assign the plaque to a business first.");
      setDestUrl("");
      refresh();
    },
  });

  const record = q.data?.ok ? q.data.record : null;
  if (q.isLoading) return <p className="text-[13px] text-muted-foreground">Loading…</p>;
  if (!record) return <p className="text-[13px] text-muted-foreground">That plaque could not be found.</p>;

  const { plaque, business, location, programming, destinations, placements, programmingEvents, performance } = record;
  const live = destinations.find((d) => d.effective_to === null) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/plaques" className="text-[12px] font-semibold text-muted-foreground">
          ← Plaques
        </Link>
        <h1 className="mt-2 font-display text-[24px] font-bold tracking-tight">
          {plaque.plaqueName ?? plaque.plaqueCode}
        </h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {plaque.plaqueCode} · /{plaque.publicSlug} {plaque.batchId ? `· batch ${plaque.batchId}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusChip tone={plaque.status === "active" ? "ok" : "idle"}>{plaque.status.replace(/_/g, " ")}</StatusChip>
          <StatusChip tone={programming?.write_status === "written" ? "ok" : "attention"}>
            {programming?.write_status === "written" ? "NFC written" : "Not written"}
          </StatusChip>
          <StatusChip tone={programming?.verification_status === "verified" ? "ok" : "attention"}>
            {programming?.verification_status === "verified" ? "Verified" : "Unverified"}
          </StatusChip>
          {plaque.hasActivationCode ? <StatusChip tone="brand">Activation code live</StatusChip> : null}
        </div>
      </div>

      {note ? <p className="rounded-xl border border-border bg-foreground/5 p-3 text-[13px]">{note}</p> : null}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Today" value={performance.today} />
        <Stat label="7 days" value={performance.days7} />
        <Stat label="30 days" value={performance.days30} />
        <Stat label="All time" value={performance.allTime} hint={`${performance.nfc} NFC · ${performance.qr} QR`} />
      </div>

      <GlassPanel className="space-y-1.5 p-4 text-[12px]">
        <Row label="Owner" value={business?.name ?? "Unassigned"} />
        <Row label="Location" value={location?.name ?? "—"} />
        <Row label="Placement" value={plaque.placementType ? PLACEMENT_LABEL[plaque.placementType] ?? plaque.placementType : "—"} />
        <Row label="Live destination" value={live ? `${DESTINATION_LABEL[live.destination_type] ?? live.destination_type} → ${live.url}` : "None"} />
        <Row label="NFC link" value={nfcUrl(plaque.publicSlug)} />
        <Row label="QR link" value={qrUrl(plaque.publicSlug)} />
      </GlassPanel>

      <NfcPlaquePanel plaqueId={id} publicSlug={plaque.publicSlug} />

      <div className="flex flex-wrap gap-2">
        <Link
          to="/admin/plaques/$id/program"
          params={{ id }}
          className="rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground"
        >
          Open programming record
        </Link>
      </div>

      <div>
        <SectionTitle>Assign to a business</SectionTitle>
        <GlassPanel className="space-y-2.5 p-4">
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13px]"
          >
            <option value="">Choose a business…</option>
            {(businesses.data?.ok ? businesses.data.businesses : []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <input
              value={plaqueName}
              onChange={(e) => setPlaqueName(e.target.value)}
              placeholder="Plaque name (e.g. Front counter)"
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-[13px]"
            />
            <select
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-[13px]"
            >
              <option value="">Placement…</option>
              {Object.entries(PLACEMENT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!businessId || assign.isPending}
            onClick={() => assign.mutate()}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground disabled:opacity-50"
          >
            {assign.isPending ? "Saving…" : "Assign plaque"}
          </button>
        </GlassPanel>
      </div>

      <div>
        <SectionTitle>Where it sends people</SectionTitle>
        <GlassPanel className="space-y-2.5 p-4">
          <select
            value={destType}
            onChange={(e) => setDestType(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13px]"
          >
            {Object.entries(DESTINATION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={destUrl}
            onChange={(e) => setDestUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13px]"
          />
          <button
            type="button"
            disabled={!destUrl || setDestination.isPending}
            onClick={() => setDestination.mutate()}
            className="w-full rounded-xl border border-border bg-foreground/5 px-4 py-2.5 text-[13px] font-bold disabled:opacity-50"
          >
            {setDestination.isPending ? "Saving…" : "Update destination"}
          </button>
        </GlassPanel>
      </div>

      <div>
        <SectionTitle>Lifecycle</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={changeStatus.isPending}
              onClick={() => changeStatus.mutate(s)}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                plaque.status === s ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Destination history</SectionTitle>
        <GlassPanel className="divide-y divide-border">
          {destinations.length === 0 ? <p className="p-4 text-[13px] text-muted-foreground">No destinations yet.</p> : null}
          {destinations.map((d) => (
            <div key={d.id} className="p-3.5 text-[12px]">
              <p className="font-semibold">{DESTINATION_LABEL[d.destination_type] ?? d.destination_type}</p>
              <p className="truncate text-muted-foreground">{d.url}</p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(d.effective_from).toLocaleDateString()} → {d.effective_to ? new Date(d.effective_to).toLocaleDateString() : "now"}
              </p>
            </div>
          ))}
        </GlassPanel>
      </div>

      <div>
        <SectionTitle>Placement history</SectionTitle>
        <GlassPanel className="divide-y divide-border">
          {placements.length === 0 ? <p className="p-4 text-[13px] text-muted-foreground">No placement changes.</p> : null}
          {placements.map((p) => (
            <div key={p.id} className="p-3.5 text-[12px]">
              <p className="font-semibold">{p.placement_name ?? p.placement_type ?? "Placement"}</p>
              <p className="text-[11px] text-muted-foreground">{new Date(p.effective_from).toLocaleString()}</p>
            </div>
          ))}
        </GlassPanel>
      </div>

      <div>
        <SectionTitle>Programming log</SectionTitle>
        <GlassPanel className="divide-y divide-border">
          {programmingEvents.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground">Nothing logged yet.</p>
          ) : null}
          {programmingEvents.map((e, i) => (
            <div key={`${e.created_at}-${i}`} className="flex items-center justify-between gap-3 p-3.5 text-[12px]">
              <span className="font-semibold">{e.event_type.replace(/_/g, " ")}</span>
              <span className="text-muted-foreground">
                {e.result ?? "—"} · {new Date(e.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </GlassPanel>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate text-right font-semibold">{value}</span>
    </div>
  );
}
