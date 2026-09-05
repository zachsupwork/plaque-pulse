import { createFileRoute, Link } from "@tanstack/react-router";
import { GlassPanel } from "@/components/taplocal/Field";
import { useIdentity, useSignOut } from "@/hooks/useAuthSession";

export const Route = createFileRoute("/admin/more")({
  head: () => ({
    meta: [
      { title: "More admin tools — TapLocal" },
      { name: "description", content: "Customers, analytics, NFC tools and admin settings." },
      { property: "og:title", content: "More admin tools — TapLocal" },
      { property: "og:description", content: "Customers, analytics, NFC tools and admin settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: More,
});

const TOOLS = [
  { to: "/admin/customers", label: "Customers", hint: "Accounts and who they belong to" },
  { to: "/admin/analytics", label: "Analytics", hint: "Real placements, destinations, top performers" },
  { to: "/admin/nfc", label: "NFC tools", hint: "Write, verify and batch programming" },
  { to: "/demo", label: "Sales mode", hint: "Labelled example walkthrough for prospects" },
  { to: "/admin/settings", label: "Settings", hint: "Your session and SmartLink domain" },
] as const;

const NAVIGATION = [
  { to: "/", label: "Main TapLocal site", hint: "The public homepage" },
  { to: "/app", label: "Business portal", hint: "See what customers see" },
] as const;

function Section({
  title,
  links,
}: {
  title: string;
  links: readonly { to: string; label: string; hint: string }[];
}) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">{title}</h2>
      <div className="space-y-2.5">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="block">
            <GlassPanel className="p-4">
              <p className="text-[14px] font-bold">{l.label}</p>
              <p className="text-[12px] text-muted-foreground">{l.hint}</p>
            </GlassPanel>
          </Link>
        ))}
      </div>
    </section>
  );
}

function More() {
  const identity = useIdentity();
  const { signOut, pending, error } = useSignOut();

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[24px] font-bold tracking-tight">More</h1>

      <Section title="Admin tools" links={TOOLS} />
      <Section title="Navigation" links={NAVIGATION} />

      <section>
        <h2 className="mb-2 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">Account</h2>
        <GlassPanel className="p-4">
          <p className="truncate text-[14px] font-bold">{identity.data?.email ?? "Signed in"}</p>
          <p className="text-[12px] text-muted-foreground">Administrator</p>
          <button
            type="button"
            onClick={signOut}
            disabled={pending}
            className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-[13px] font-bold text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
          {error ? <p className="mt-2 text-[12px] text-destructive">{error}</p> : null}
        </GlassPanel>
      </section>
    </div>
  );
}
