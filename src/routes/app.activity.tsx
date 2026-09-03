import { createFileRoute } from "@tanstack/react-router";
import { GlassPanel } from "@/components/taplocal/Field";
import { usePortal, useActionHistory } from "@/hooks/usePortal";
import { DESTINATION_LABEL, INTENT_LABEL } from "@/lib/taplocal";

export const Route = createFileRoute("/app/activity")({
  head: () => ({
    meta: [
      { title: "Activity — TapLocal" },
      { name: "description", content: "Recent taps and every change made to your plaques." },
      { property: "og:title", content: "Activity — TapLocal" },
      { property: "og:description", content: "Recent taps and every change made to your plaques." },
    ],
  }),
  component: ActivityPage,
});

const ACTOR_LABEL: Record<string, string> = {
  owner: "You",
  copilot: "Copilot (with your approval)",
  admin: "TapLocal support",
  automation: "Automatic",
};

function ActivityPage() {
  const { plaques, events } = usePortal();
  const actions = useActionHistory();

  const nameFor = (id: string | null) => {
    const p = plaques.find((x) => x.id === id);
    return p?.plaque_name ?? p?.plaque_code ?? "A plaque";
  };

  const recent = events
    .filter((e) => e.event_type === "interaction")
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
    .slice(0, 25);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-[26px] font-bold tracking-tight">Activity</h1>

      <section>
        <h2 className="font-display text-[15px] font-semibold tracking-tight">Changes made</h2>
        <div className="mt-2.5 space-y-2">
          {(actions.data ?? []).length ? (
            (actions.data ?? []).map((a) => (
              <GlassPanel key={a.id} className="p-3.5">
                <p className="text-[13px] font-semibold">{describe(a)}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {nameFor(a.plaque_id)} · {ACTOR_LABEL[a.initiated_by] ?? a.initiated_by} ·{" "}
                  {new Date(a.created_at).toLocaleDateString()}
                </p>
              </GlassPanel>
            ))
          ) : (
            <p className="text-[13px] text-muted-foreground">No changes yet.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-[15px] font-semibold tracking-tight">Latest taps</h2>
        <div className="mt-2.5 space-y-1.5">
          {recent.map((e, i) => (
            <div
              key={`${e.occurred_at}-${i}`}
              className="flex items-center justify-between rounded-xl border border-border bg-foreground/[0.04] px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{nameFor(e.plaque_id)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {e.source_type === "qr" ? "QR scan" : "Phone tap"} ·{" "}
                  {INTENT_LABEL[e.intent_type ?? ""] ?? "Tap"}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {new Date(e.occurred_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                })}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function describe(a: { action_type: string; new_value: unknown }) {
  const value = a.new_value as { destination_type?: string } | null;
  if (a.action_type === "destination_change" && value?.destination_type) {
    return `Destination changed to ${DESTINATION_LABEL[value.destination_type] ?? value.destination_type}`;
  }
  return a.action_type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
