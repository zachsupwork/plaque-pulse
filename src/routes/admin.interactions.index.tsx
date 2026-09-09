import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GlassPanel, SectionTitle, StatusChip } from "@/components/taplocal/Field";
import { listInteractions } from "@/lib/interactions.functions";
import { DESTINATION_LABEL, PLACEMENT_LABEL } from "@/lib/taplocal";

const search = z.object({
  days: z.coerce.number().int().min(1).max(365).catch(30),
  source: z.enum(["all", "nfc", "qr"]).catch("all"),
  period: z.enum(["today", "window"]).catch("window"),
  placement: z.string().catch("all"),
  destination: z.string().catch("all"),
  device: z.string().catch("all"),
  attribution: z.enum(["any", "has", "none"]).catch("any"),
  businessId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/admin/interactions/")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Every tap and scan — TapLocal admin" },
      { name: "description", content: "Filter real TapLocal NFC taps and QR scans and open any one for detailed analysis." },
      { property: "og:title", content: "Every tap and scan — TapLocal admin" },
      { property: "og:description", content: "Filter real TapLocal NFC taps and QR scans and open any one for detailed analysis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Interactions,
});

function Interactions() {
  const params = Route.useSearch();
  const navigate = Route.useNavigate();
  const listFn = useServerFn(listInteractions);

  const q = useQuery({
    queryKey: ["admin-interactions", params],
    queryFn: () =>
      listFn({
        data: {
          days: params.days,
          source: params.source,
          period: params.period,
          placement: params.placement,
          destination: params.destination,
          device: params.device,
          attribution: params.attribution,
          businessId: params.businessId ?? null,
          plaqueId: null,
          minConfidence: 0,
          limit: 200,
        },
      }),
    refetchInterval: 15_000,
  });

  const rows = q.data?.ok ? q.data.rows : [];
  const facets = q.data?.ok ? q.data.facets : null;

  const set = (patch: Partial<typeof params>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Taps &amp; scans</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Every real customer interaction. Tap any row for the full analysis.
        </p>
      </div>

      <GlassPanel className="space-y-3 p-3.5">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["today", "Today"],
              ["window", `Last ${params.days}d`],
            ] as const
          ).map(([value, label]) => (
            <Chip key={value} active={params.period === value} onClick={() => set({ period: value })}>
              {label}
            </Chip>
          ))}
          {([7, 30, 90] as const).map((d) => (
            <Chip
              key={d}
              active={params.period === "window" && params.days === d}
              onClick={() => set({ period: "window", days: d })}
            >
              {d}d
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "NFC + QR"],
              ["nfc", "NFC only"],
              ["qr", "QR only"],
            ] as const
          ).map(([value, label]) => (
            <Chip key={value} active={params.source === value} onClick={() => set({ source: value })}>
              {label}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["any", "All results"],
              ["has", "Possible outcome"],
              ["none", "No outcome yet"],
            ] as const
          ).map(([value, label]) => (
            <Chip key={value} active={params.attribution === value} onClick={() => set({ attribution: value })}>
              {label}
            </Chip>
          ))}
        </div>

        {facets ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <Select
              label="Placement"
              value={params.placement}
              options={facets.placements.map((p) => [p, PLACEMENT_LABEL[p] ?? p] as const)}
              onChange={(v) => set({ placement: v })}
            />
            <Select
              label="Destination"
              value={params.destination}
              options={facets.destinations.map((d) => [d, DESTINATION_LABEL[d] ?? d] as const)}
              onChange={(v) => set({ destination: v })}
            />
            <Select
              label="Device"
              value={params.device}
              options={facets.devices.map((d) => [d, d] as const)}
              onChange={(v) => set({ device: v })}
            />
          </div>
        ) : null}
      </GlassPanel>

      {q.data && !q.data.ok ? (
        <GlassPanel className="border-destructive/40 p-4 text-[13px] font-semibold text-destructive">
          Interaction data is unavailable right now. This is a read problem, not a sign that nothing happened.
        </GlassPanel>
      ) : null}

      <div>
        <SectionTitle>{q.data?.ok ? `${q.data.total} interactions` : "Interactions"}</SectionTitle>
        <GlassPanel className="divide-y divide-border">
          {q.isLoading ? <p className="p-4 text-[13px] text-muted-foreground">Loading…</p> : null}
          {!q.isLoading && rows.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-foreground">Nothing matches these filters.</p>
          ) : null}
          {rows.map((r) => (
            <Link
              key={r.id}
              to="/admin/interactions/$eventId"
              params={{ eventId: r.id }}
              className="flex items-center justify-between gap-3 p-3.5"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <StatusChip tone={r.source === "NFC" ? "ok" : "brand"}>{r.source}</StatusChip>
                  <span className="truncate text-[13px] font-semibold">{r.business}</span>
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                  {[
                    r.plaque,
                    r.placement ? (PLACEMENT_LABEL[r.placement] ?? r.placement) : null,
                    r.destination ? (DESTINATION_LABEL[r.destination] ?? r.destination) : null,
                    r.device,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {r.attribution ? (
                  <span className="mt-1 block truncate text-[12px] font-semibold text-primary">
                    {r.attribution.badge} · {r.attribution.headline} ({r.attribution.best}%)
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                {new Date(r.at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </Link>
          ))}
        </GlassPanel>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
        active ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-[13px]"
      >
        <option value="all">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
