import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GlassPanel } from "@/components/taplocal/Field";
import { usePortal } from "@/hooks/usePortal";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — TapLocal" },
      { name: "description", content: "Your business details, goal and connected accounts." },
      { property: "og:title", content: "Settings — TapLocal" },
      { property: "og:description", content: "Your business details, goal and connected accounts." },
    ],
  }),
  component: SettingsPage,
});

const GOAL_LABEL: Record<string, string> = {
  google_reviews: "More Google reviews",
  instagram_followers: "More Instagram followers",
  bookings: "More bookings",
  leads: "More enquiries",
  foot_traffic: "More people through the door",
  orders: "More orders",
};

function SettingsPage() {
  const { businessId, business } = usePortal();

  const integrations = useQuery({
    queryKey: ["integrations", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integrations")
        .select("id, provider, status, connected_at")
        .eq("business_id", businessId!);
      if (error) throw error;
      return data;
    },
    enabled: Boolean(businessId),
  });

  const goals = useQuery({
    queryKey: ["goals", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals")
        .select("id, goal_type, active")
        .eq("business_id", businessId!)
        .eq("active", true);
      if (error) throw error;
      return data;
    },
    enabled: Boolean(businessId),
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-[26px] font-bold tracking-tight">Settings</h1>

      <GlassPanel className="p-4">
        <p className="font-display text-[14px] font-semibold tracking-tight">Your business</p>
        <Row label="Name" value={business?.name ?? "—"} />
        <Row label="Type" value={pretty(business?.business_type)} />
        <Row label="Time zone" value={business?.timezone ?? "—"} />
      </GlassPanel>

      <GlassPanel className="p-4">
        <p className="font-display text-[14px] font-semibold tracking-tight">What you're going for</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {(goals.data ?? []).map((g) => (
            <span
              key={g.id}
              className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1.5 text-[12px] font-semibold text-primary"
            >
              {GOAL_LABEL[g.goal_type] ?? pretty(g.goal_type)}
            </span>
          ))}
          {(goals.data ?? []).length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No goal set yet.</p>
          ) : null}
        </div>
      </GlassPanel>

      <GlassPanel className="p-4">
        <p className="font-display text-[14px] font-semibold tracking-tight">Connected accounts</p>
        <div className="mt-2.5 space-y-2">
          {(integrations.data ?? []).map((i) => (
            <div key={i.id} className="flex items-center justify-between">
              <span className="text-[13px]">{pretty(i.provider)}</span>
              <span
                className={
                  i.status === "connected"
                    ? "rounded-full border border-accent/30 bg-accent/15 px-2.5 py-1 text-[12px] font-semibold text-accent"
                    : "rounded-full border border-border bg-foreground/5 px-2.5 py-1 text-[12px] font-semibold text-muted-foreground"
                }
              >
                {i.status === "connected" ? "Connected" : pretty(i.status)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          Connected accounts let us line up your reviews and followers with plaque activity. They never let us
          post on your behalf.
        </p>
      </GlassPanel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2.5 flex items-center justify-between">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-semibold">{value}</span>
    </div>
  );
}

function pretty(value?: string | null) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
