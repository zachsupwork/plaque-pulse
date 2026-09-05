import { Link } from "@tanstack/react-router";
import { Home, LayoutGrid, PieChart, Activity, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean };

const items: NavItem[] = [
  { to: "/app", label: "Home", icon: Home, exact: true },
  { to: "/app/plaques", label: "Plaques", icon: LayoutGrid },
  { to: "/app/results", label: "Results", icon: PieChart },
  { to: "/app/activity", label: "Activity", icon: Activity },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function PortalNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/90 shadow-[0_-8px_30px_oklch(0.22_0.035_268_/_6%)] backdrop-blur-xl">
      <div className="mx-auto grid max-w-2xl grid-cols-5 px-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact ?? false }}
            className="group flex flex-col items-center gap-1 py-1.5 text-muted-foreground"
            activeProps={{ "data-active": "true" } as Record<string, string>}
          >
            <span className="grid h-8 w-8 place-items-center rounded-full transition-colors group-data-[active=true]:bg-primary/10 group-data-[active=true]:text-primary">
              <item.icon className="h-[19px] w-[19px]" strokeWidth={2} />
            </span>
            <span
              className={cn(
                "text-[10px] font-medium",
                "group-data-[active=true]:font-bold group-data-[active=true]:text-primary",
              )}
            >
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
