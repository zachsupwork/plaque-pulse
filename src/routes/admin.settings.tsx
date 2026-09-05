import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { GlassPanel, SectionTitle, StatusChip } from "@/components/taplocal/Field";
import { supabase } from "@/integrations/supabase/client";
import { useAdminIdentity } from "./admin";
import {
  SMARTLINK_PRODUCTION_ORIGIN,
  smartlinkBase,
  smartlinkEnvironmentLabel,
} from "@/lib/smartlink";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "Admin settings — TapLocal" },
      { name: "description", content: "Signed-in admin account and SmartLink domain status." },
      { property: "og:title", content: "Admin settings — TapLocal" },
      { property: "og:description", content: "Signed-in admin account and SmartLink domain status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSettings,
});

function AdminSettings() {
  const identity = useAdminIdentity();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Your admin session and platform link setup.</p>
      </div>

      <div>
        <SectionTitle>Account</SectionTitle>
        <GlassPanel className="space-y-2 p-4 text-[13px]">
          <p className="font-semibold">{identity.data?.email ?? "Signed in"}</p>
          <StatusChip tone={identity.data?.isAdmin ? "ok" : "attention"}>
            {identity.data?.isAdmin ? "Platform administrator" : "No admin access"}
          </StatusChip>
          <button
            type="button"
            onClick={signOut}
            className="mt-2 w-full rounded-xl border border-border bg-foreground/5 px-4 py-2.5 text-[13px] font-bold"
          >
            Sign out
          </button>
        </GlassPanel>
      </div>

      <div>
        <SectionTitle>SmartLink domain</SectionTitle>
        <GlassPanel className="space-y-2 p-4 text-[13px]">
          <p>
            Links printed on plaques today: <span className="font-semibold">{smartlinkBase()}</span>
          </p>
          <StatusChip tone={smartlinkEnvironmentLabel() === "Production SmartLink" ? "ok" : "attention"}>
            {smartlinkEnvironmentLabel()}
          </StatusChip>
          <p className="text-[12px] text-muted-foreground">
            Target short domain once DNS is live: {SMARTLINK_PRODUCTION_ORIGIN}
          </p>
        </GlassPanel>
      </div>
    </div>
  );
}
