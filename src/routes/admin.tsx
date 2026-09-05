import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Field, GlassPanel } from "@/components/taplocal/Field";
import { BrandLockup } from "@/components/taplocal/Brand";
import { adminIdentity } from "@/lib/admin-data.functions";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const PRIMARY = [
  { to: "/admin", label: "Dashboard", exact: true },
  { to: "/admin/businesses", label: "Businesses", exact: false },
  { to: "/admin/plaques", label: "Plaques", exact: false },
  { to: "/admin/provisioning", label: "Manufacturing", exact: false },
] as const;

const SECONDARY = [
  { to: "/admin/customers", label: "Customers" },
  { to: "/admin/analytics", label: "Analytics" },
  { to: "/admin/nfc", label: "NFC Tools" },
  { to: "/admin/settings", label: "Settings" },
] as const;

/** Live view of who is signed in and whether they hold the admin role. */
export function useAdminIdentity() {
  const check = useServerFn(adminIdentity);
  return useQuery({
    queryKey: ["admin-identity"],
    queryFn: () => check({ data: undefined }),
    staleTime: 60_000,
  });
}

function AdminLayout() {
  const identity = useAdminIdentity();

  if (identity.isLoading) {
    return (
      <Field>
        <div className="mx-auto max-w-md px-5 py-24 text-center text-[13px] text-muted-foreground">Checking access…</div>
      </Field>
    );
  }

  if (!identity.data?.signedIn) {
    return (
      <Field>
        <div className="mx-auto max-w-md px-5 py-20">
          <GlassPanel className="p-7 text-center">
            <BrandLockup suffix="Admin" />
            <h1 className="mt-5 font-display text-[22px] font-bold tracking-tight">Sign in to manage TapLocal</h1>
            <p className="mt-2 text-[13px] text-muted-foreground">
              The TapLocal admin area is for TapLocal Digital staff.
            </p>
            <Link
              to="/auth"
              search={{ returnTo: "/admin" }}
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground"
            >
              Sign in as admin
            </Link>
          </GlassPanel>
        </div>
      </Field>
    );
  }

  if (!identity.data.isAdmin) {
    return (
      <Field>
        <div className="mx-auto max-w-md px-5 py-20">
          <GlassPanel className="p-7">
            <BrandLockup suffix="Admin" />
            <h1 className="mt-5 font-display text-[20px] font-bold tracking-tight">No administrator access</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Your account is signed in but does not have TapLocal administrator access.
            </p>
            {identity.data.email ? (
              <p className="mt-3 rounded-xl border border-border bg-foreground/5 px-3 py-2 text-[12px]">
                Signed in as <span className="font-semibold">{identity.data.email}</span>
              </p>
            ) : null}
            <Link to="/app" className="mt-5 inline-block text-[13px] font-semibold text-primary">
              Go to the business portal →
            </Link>
          </GlassPanel>
        </div>
      </Field>
    );
  }

  return (
    <Field>
      <div className="mx-auto flex max-w-6xl gap-6 px-4 pt-5 pb-28 md:px-6 md:pb-10">
        <aside className="hidden w-52 shrink-0 md:block">
          <BrandLockup suffix="Admin" />
          <nav className="mt-5 space-y-1">
            {[...PRIMARY.map((t) => ({ ...t })), ...SECONDARY.map((t) => ({ ...t, exact: false }))].map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                activeOptions={{ exact: tab.exact }}
                className="block rounded-xl px-3 py-2 text-[13px] font-semibold text-muted-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary"
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card/95 backdrop-blur md:hidden">
        {[...PRIMARY, { to: "/admin/more", label: "More", exact: false } as const].map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: tab.exact }}
            className="px-1 py-3 text-center text-[11px] font-semibold text-muted-foreground data-[status=active]:text-primary"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </Field>
  );
}
