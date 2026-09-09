import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, StatusChip, type StatusTone } from "@/components/taplocal/Field";
import { getInteraction, refreshInteractionAnalysis } from "@/lib/interactions.functions";
import { DESTINATION_LABEL, PLACEMENT_LABEL } from "@/lib/taplocal";

export const Route = createFileRoute("/admin/interactions/$eventId")({
  head: () => ({
    meta: [
      { title: "Interaction analysis — TapLocal admin" },
      { name: "description", content: "Exactly what TapLocal recorded for one tap, and what may have come of it." },
      { property: "og:title", content: "Interaction analysis — TapLocal admin" },
      { property: "og:description", content: "Exactly what TapLocal recorded for one tap, and what may have come of it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InteractionDetail,
});

const BADGE_TONE: Record<string, StatusTone> = {
  CONFIRMED: "ok",
  OBSERVED: "ok",
  EXTERNAL: "brand",
  INFERRED: "attention",
};

function InteractionDetail() {
  const { eventId } = Route.useParams();
  const getFn = useServerFn(getInteraction);
  const refreshFn = useServerFn(refreshInteractionAnalysis);
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ["admin-interaction", eventId],
    queryFn: () => getFn({ data: { eventId, refresh: false } }),
  });

  const refresh = useMutation({
    mutationFn: () => refreshFn({ data: { eventId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-interaction", eventId] }),
  });

  const i = q.data?.ok ? q.data.interaction : null;

  return (
    <div className="space-y-5">
      <Link to="/admin/interactions" search={{}} className="text-[13px] font-semibold text-muted-foreground">
        ← All taps &amp; scans
      </Link>

      {q.isLoading ? <p className="text-[13px] text-muted-foreground">Loading…</p> : null}
      {q.data?.ok && !i ? (
        <GlassPanel className="p-4 text-[13px] text-muted-foreground">This interaction no longer exists.</GlassPanel>
      ) : null}

      {i ? (
        <>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={i.sourceType === "nfc" ? "ok" : "brand"}>{i.source}</StatusChip>
              {i.redirectResult === "redirect_failure" ? <StatusChip tone="problem">REDIRECT FAILED</StatusChip> : null}
            </div>
            <h1 className="mt-2 font-display text-[24px] font-bold tracking-tight">
              {i.business?.name ?? "Unassigned plaque"}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {new Date(i.occurredAt).toLocaleString()} ·{" "}
              {i.destinationType ? (DESTINATION_LABEL[i.destinationType] ?? i.destinationType) : "no destination"}
            </p>
          </div>

          <div>
            <SectionTitle>What TapLocal recorded</SectionTitle>
            <GlassPanel className="divide-y divide-border">
              <Row label="Plaque">
                {i.plaque ? (
                  <Link to="/admin/plaques/$id" params={{ id: i.plaque.id }} className="font-semibold text-primary">
                    {i.plaque.plaque_name || i.plaque.plaque_code} · /{i.plaque.public_slug}
                  </Link>
                ) : (
                  "Not recorded"
                )}
              </Row>
              <Row label="Placement">
                {i.plaque?.placement_type
                  ? (PLACEMENT_LABEL[i.plaque.placement_type] ?? i.plaque.placement_type)
                  : "Not set"}
              </Row>
              <Row label="Place">{i.location ? [i.location.name, i.location.address].filter(Boolean).join(" · ") : "Not recorded"}</Row>
              <Row label="Sent to">
                {i.destination?.url ? (
                  <a href={i.destination.url} target="_blank" rel="noreferrer" className="break-all font-semibold text-primary">
                    {i.destination.url}
                  </a>
                ) : (
                  "Not recorded"
                )}
              </Row>
              <Row label="Device">{[i.deviceFamily, i.browserFamily].filter(Boolean).join(" · ") || "Not recorded"}</Row>
              <Row label="Area">{[i.coarseRegion, i.coarseCountry].filter(Boolean).join(", ") || "Not recorded"}</Row>
              <Row label="Redirect">
                {i.redirectResult === "redirect_success"
                  ? "Confirmed opened"
                  : i.redirectResult === "redirect_failure"
                    ? "Failed"
                    : "No separate confirmation recorded"}
              </Row>
            </GlassPanel>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              TapLocal never identifies the person who tapped. Everything above is anonymous.
            </p>
          </div>

          <div>
            <SectionTitle
              action={
                <button
                  type="button"
                  onClick={() => refresh.mutate()}
                  disabled={refresh.isPending}
                  className="text-[12px] font-semibold text-primary disabled:opacity-60"
                >
                  {refresh.isPending ? "Checking…" : "Re-check now →"}
                </button>
              }
            >
              What may have come of it
            </SectionTitle>
            <GlassPanel className="divide-y divide-border">
              {i.candidates.length === 0 ? (
                <p className="p-4 text-[13px] text-muted-foreground">
                  Nothing linked to this tap yet. Re-check pulls the latest public listing activity.
                </p>
              ) : null}
              {i.candidates.map((c) => (
                <div key={c.id} className="space-y-1.5 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip tone={BADGE_TONE[c.badge] ?? "brand"}>{c.badge}</StatusChip>
                    <span className="text-[13px] font-semibold">{c.headline}</span>
                    <span className="ml-auto text-[12px] font-bold">{c.confidence}%</span>
                  </div>
                  {c.detail ? <p className="text-[12px] leading-relaxed text-muted-foreground">{c.detail}</p> : null}
                  {c.occurred_at ? (
                    <p className="text-[11px] text-muted-foreground">Seen {new Date(c.occurred_at).toLocaleString()}</p>
                  ) : null}
                </div>
              ))}
            </GlassPanel>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              OBSERVED = TapLocal saw it happen. EXTERNAL = seen on a public listing. INFERRED = a timing match only,
              never proof.
            </p>
          </div>

          {i.relatedActivity.length ? (
            <div>
              <SectionTitle>Same anonymous session</SectionTitle>
              <GlassPanel className="divide-y divide-border">
                {i.relatedActivity.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 p-3 text-[13px]">
                    <span>
                      {r.type === "interaction" ? (r.source === "qr" ? "QR scan" : "NFC tap") : r.type}
                      {r.sameBusiness ? "" : " · different business"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{new Date(r.at).toLocaleString()}</span>
                  </div>
                ))}
              </GlassPanel>
            </div>
          ) : null}

          {i.business ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                to="/admin/businesses/$id"
                params={{ id: i.business.id }}
                className="rounded-2xl border border-border bg-card p-3.5 text-center text-[13px] font-bold"
              >
                Open business
              </Link>
              <Link
                to="/admin/maps"
                search={{ businessId: i.business.id }}
                className="rounded-2xl border border-border bg-card p-3.5 text-center text-[13px] font-bold"
              >
                Maps &amp; photo watch
              </Link>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 text-[13px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}
