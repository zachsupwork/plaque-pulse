import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Field } from "@/components/taplocal/Field";
import { useAdminGate } from "@/hooks/useAdminGate";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const TABS = [
  { to: "/admin", label: "Provisioning", exact: true },
  { to: "/admin/plaques", label: "Plaques", exact: false },
  { to: "/admin/nfc", label: "NFC Tools", exact: false },
] as const;

function AdminLayout() {
  const gate = useAdminGate();

  return (
    <Field>
      <div className="mx-auto max-w-3xl px-5 pt-6 pb-16">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              activeOptions={{ exact: tab.exact }}
              className="rounded-full border border-border bg-foreground/5 px-3.5 py-2 text-[12px] font-semibold text-muted-foreground data-[status=active]:border-primary/40 data-[status=active]:bg-primary/15 data-[status=active]:text-foreground"
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {gate.data && !gate.data.isAdmin ? (
          <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-[13px] text-destructive">
            You're signed out or not a TapLocal admin. Manufacturing actions will be rejected.
          </p>
        ) : null}

        <div className="mt-5">
          <Outlet />
        </div>
      </div>
    </Field>
  );
}
