import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Field } from "@/components/taplocal/Field";
import { PortalNav } from "@/components/taplocal/PortalNav";
import { PortalHeader } from "@/components/taplocal/PortalHeader";
import { WelcomeGate } from "@/components/taplocal/WelcomeGate";
import { useBusinessId } from "@/hooks/usePortal";

export const Route = createFileRoute("/app")({
  component: PortalLayout,
});

function PortalLayout() {
  const { data: businessId, isPending } = useBusinessId();

  if (isPending) {
    return (
      <Field>
        <div className="mx-auto max-w-2xl px-5 pt-10">
          <div className="h-4 w-28 animate-pulse rounded-full bg-foreground/10" />
          <div className="mt-4 h-28 animate-pulse rounded-2xl bg-foreground/[0.07]" />
        </div>
      </Field>
    );
  }

  if (!businessId) {
    return (
      <Field>
        <div className="mx-auto max-w-2xl px-5 pb-16">
          <WelcomeGate />
        </div>
      </Field>
    );
  }

  return (
    <Field>
      <div className="mx-auto max-w-2xl px-5 pt-2 pb-28">
        <PortalHeader />
        <Outlet />
      </div>
      <PortalNav />
    </Field>
  );
}
