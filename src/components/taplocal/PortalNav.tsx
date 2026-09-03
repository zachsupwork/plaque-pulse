import { Link } from "@tanstack/react-router";
import { Home, LayoutGrid, PieChart, Activity, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/app", label: "Home", icon: Home, exact: true },
  { to: "/app/plaques", label: "Plaques", icon: LayoutGrid },
  { to: "/app/results", label: "Results", icon: PieChart },
  { to: "/app/activity", label: "Activity", icon: Activity },
  { to: "/app/settings", label: "Settings", icon: Settings },
] as const;

export function PortalNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto grid max-w-2xl grid-cols-5 px-2 py-2">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact ?? false }}
            className="group flex flex-col items-center gap-1 py-1.5 text-muted-foreground"
            activeProps={{ "data-active": "true" }}
          >
            <span
              className={cn(
                "grid h-9 w-9 place-items-center rounded-xl transition-colors",
                "group-data-[active=true]:bg-primary group-data-[active=true]:text-primary-foreground",
              )}
            >
              <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="text-[10px] font-medium group-data-[active=true]:font-semibold group-data-[active=true]:text-primary">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
