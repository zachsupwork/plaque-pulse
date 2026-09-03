import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Field } from "@/components/taplocal/Field";
import { PortalNav } from "@/components/taplocal/PortalNav";

export const Route = createFileRoute("/app")({
  component: PortalLayout,
});

function PortalLayout() {
  return (
    <Field>
      <div className="mx-auto max-w-2xl px-5 pt-6 pb-28">
        <Outlet />
      </div>
      <PortalNav />
    </Field>
  );
}
