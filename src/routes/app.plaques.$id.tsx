import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { GlassPanel, TrendPill } from "@/components/taplocal/Field";
import { usePortal, activeDestination } from "@/hooks/usePortal";
import { DESTINATION_LABEL, PLACEMENT_LABEL, fetchPlacementHistory } from "@/lib/taplocal";
import { plaqueTrends, sourceSplit, byDayOfWeek } from "@/lib/metrics";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type DestinationType = Database["public"]["Enums"]["destination_type"];

export const Route = createFileRoute("/app/plaques/$id")({
  head: () => ({
    meta: [
      { title: "Plaque detail — TapLocal" },
      { name: "description", content: "How this SmartPlaque is performing and where it sends people." },
      { property: "og:title", content: "Plaque detail — TapLocal" },
      { property: "og:description", content: "How this SmartPlaque is performing and where it sends people." },
    ],
  }),
  component: PlaqueDetail,
});

const CHOICES = ["google_review", "instagram", "menu", "booking", "coupon", "custom"] as const;

function PlaqueDetail() {
  const { id } = useParams({ from: "/app/plaques/$id" });
  const { businessId, plaques, destinations, events } = usePortal();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<DestinationType | null>(null);

  const plaque = plaques.find((p) => p.id === id);
  const dest = activeDestination(destinations, id);
  const history = destinations
    .filter((d) => d.plaque_id === id && d.effective_to !== null)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  const placement = useQuery({
    queryKey: ["placement-history", id],
    queryFn: () => fetchPlacementHistory(id),
  });

  const plaqueEvents = events.filter((e) => e.plaque_id === id);
  const trend = plaqueTrends(events, 30).get(id);
  const split = sourceSplit(plaqueEvents);
  const days = byDayOfWeek(plaqueEvents);
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  const change = useMutation({
    mutationFn: async (destinationType: DestinationType) => {
      if (!businessId || !dest) throw new Error("missing");
      const now = new Date().toISOString();
      const { error: closeError } = await supabase
        .from("destinations")
        .update({ effective_to: now, active: false })
        .eq("id", dest.id);
      if (closeError) throw closeError;
      const { error: insertError } = await supabase.from("destinations").insert({
        business_id: businessId,
        plaque_id: id,
        destination_type: destinationType,
        url: dest.url,
        effective_from: now,
        active: true,
      });
      if (insertError) throw insertError;
      await supabase.from("action_history").insert({
        business_id: businessId,
        plaque_id: id,
        action_type: "destination_change",
        initiated_by: "owner",
        previous_value: { destination_type: dest.destination_type },
        new_value: { destination_type: destinationType },
      });
    },
    onSuccess: () => {
      toast.success("Destination updated. New taps go to the new place.");
      setPending(null);
      queryClient.invalidateQueries({ queryKey: ["destinations"] });
      queryClient.invalidateQueries({ queryKey: ["action-history"] });
    },
    onError: () => toast.error("That change didn't save. Nothing was altered."),
  });

  if (!plaque) {
    return <p className="text-[13px] text-muted-foreground">Loading plaque…</p>;
  }

  return (
    <div className="space-y-5">
      <Link to="/app/plaques" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> All plaques
      </Link>

      <div>
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-tight">
          {plaque.plaque_name ?? plaque.plaque_code}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {plaque.plaque_code} · {PLACEMENT_LABEL[plaque.placement_type ?? ""] ?? "Unplaced"}
        </p>
      </div>

      <GlassPanel sheen className="p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[12px] text-muted-foreground">Taps in the last 30 days</p>
            <p className="font-display text-[40px] leading-none font-bold tracking-tight">
              {trend?.current ?? 0}
            </p>
          </div>
          <TrendPill changePct={trend?.changePct ?? null} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Phone taps" value={split.nfc} />
          <Stat label="QR scans" value={split.qr} />
          <Stat label="People" value={split.uniqueVisitors} />
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <p className="font-display text-[14px] font-semibold tracking-tight">Busiest days</p>
        <div className="mt-3 flex items-end gap-1.5">
          {days.map((d) => (
            <div key={d.name} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className="w-full rounded-md bg-primary/70"
                style={{ height: `${Math.max(4, (d.count / maxDay) * 80)}px` }}
              />
              <span className="text-[10px] text-muted-foreground">{d.name}</span>
            </div>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <p className="font-display text-[14px] font-semibold tracking-tight">Where this plaque sends people</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Right now:{" "}
          <span className="font-semibold text-foreground">
            {dest ? (DESTINATION_LABEL[dest.destination_type] ?? dest.destination_type) : "Not set up"}
          </span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CHOICES.filter((c) => c !== dest?.destination_type).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setPending(c)}
              className="rounded-full border border-border bg-foreground/5 px-3 py-1.5 text-[12px] font-medium"
            >
              {DESTINATION_LABEL[c] ?? c}
            </button>
          ))}
        </div>

        {pending ? (
          <div className="mt-3 rounded-xl border border-primary/40 bg-primary/10 p-3.5">
            <p className="text-[13px] leading-relaxed text-pretty">
              Send every new tap on this plaque to{" "}
              <span className="font-semibold">{DESTINATION_LABEL[pending] ?? pending}</span> instead? Taps
              already recorded stay as they are.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={change.isPending}
                onClick={() => change.mutate(pending)}
                className="rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground disabled:opacity-60"
              >
                {change.isPending ? "Saving…" : "Yes, change it"}
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-xl border border-border px-4 py-2 text-[13px] font-semibold text-muted-foreground"
              >
                Keep it as is
              </button>
            </div>
          </div>
        ) : null}

        {history.length ? (
          <div className="mt-4 space-y-1.5 border-t border-border pt-3">
            <p className="text-[12px] font-semibold text-muted-foreground">Previously</p>
            {history.map((h) => (
              <p key={h.id} className="text-[12px] text-muted-foreground">
                {DESTINATION_LABEL[h.destination_type] ?? h.destination_type} until{" "}
                {new Date(h.effective_to!).toLocaleDateString()}
              </p>
            ))}
          </div>
        ) : null}
      </GlassPanel>

      {placement.data?.length ? (
        <GlassPanel className="p-4">
          <p className="font-display text-[14px] font-semibold tracking-tight">Where it has been</p>
          <div className="mt-2 space-y-1.5">
            {placement.data.map((m) => (
              <p key={m.id} className="text-[12px] text-muted-foreground">
                {PLACEMENT_LABEL[m.placement_type ?? ""] ?? m.placement_type} ·{" "}
                {new Date(m.effective_from).toLocaleDateString()}
                {m.reason ? ` · ${m.reason}` : ""}
              </p>
            ))}
          </div>
        </GlassPanel>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-foreground/5 py-2.5">
      <p className="font-display text-[19px] font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
