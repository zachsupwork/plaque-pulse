import { createFileRoute, Link } from "@tanstack/react-router";
import { GlassPanel } from "@/components/taplocal/Field";

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

const LINKS = [
  { to: "/admin/customers", label: "Customers", hint: "Accounts and who they belong to" },
  { to: "/admin/analytics", label: "Analytics", hint: "Placements, destinations, top performers" },
  { to: "/admin/nfc", label: "NFC tools", hint: "Write, verify and batch programming" },
  { to: "/admin/settings", label: "Settings", hint: "Your session and SmartLink domain" },
  { to: "/app", label: "Business portal", hint: "See what customers see" },
] as const;

function More() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[24px] font-bold tracking-tight">More</h1>
      <div className="space-y-2.5">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="block">
            <GlassPanel className="p-4">
              <p className="text-[14px] font-bold">{l.label}</p>
              <p className="text-[12px] text-muted-foreground">{l.hint}</p>
            </GlassPanel>
          </Link>
        ))}
      </div>
    </div>
  );
}
