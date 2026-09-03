import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PlaquePicker } from "@/components/taplocal/PlaquePicker";

export const Route = createFileRoute("/admin/plaques/")({
  head: () => ({
    meta: [
      { title: "Plaque inventory — TapLocal admin" },
      { name: "description", content: "Find any SmartPlaque by ID, slug or batch and open its programming record." },
      { property: "og:title", content: "Plaque inventory — TapLocal admin" },
      { property: "og:description", content: "Find any SmartPlaque and open its programming record." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlaqueIndex,
});

function PlaqueIndex() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Plaque inventory</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Search by plaque ID, public slug or batch ID to open its programming record.
        </p>
      </div>
      <PlaquePicker onSelect={(p) => navigate({ to: "/admin/plaques/$id/program", params: { id: p.id } })} />
    </div>
  );
}
