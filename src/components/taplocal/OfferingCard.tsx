import { Link } from "@tanstack/react-router";
import { ProductImage } from "@/components/taplocal/Product";
import type { Offering } from "@/lib/offerings.functions";

export const CATEGORY_LABELS: Record<string, string> = {
  smartplaques: "SmartPlaques",
  services: "Business services",
  packages: "Packs",
  custom: "Custom",
};

/** Image-first catalog card: the plaque does the selling, the words support it. */
export function OfferingCard({ offering, onInterested }: { offering: Offering; onInterested: () => void }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
      <div className="cloud-surface p-3">
        <ProductImage
          src={offering.image_url}
          alt={offering.name}
          className="h-52 w-full sm:h-56"
        />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
          {CATEGORY_LABELS[offering.category] ?? offering.category}
        </p>
        <h3 className="mt-1 font-display text-[17px] leading-tight font-bold tracking-tight">{offering.name}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {offering.short_description}
        </p>
        {offering.metadata?.tagline ? (
          <p className="mt-2 text-[11px] font-semibold tracking-wide text-primary">
            {offering.metadata.tagline}
          </p>
        ) : null}
        <div className="flex-1" />
        <p className="mt-3 text-[13px] font-bold">
          {offering.starting_price_text || <span className="text-muted-foreground">Contact for pricing</span>}
        </p>
        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            onClick={onInterested}
            className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-[12px] font-bold tracking-wide text-primary-foreground uppercase"
          >
            {offering.cta_label}
          </button>
          <Link
            to="/offerings/$slug"
            params={{ slug: offering.slug }}
            className="rounded-xl border border-border px-3 py-2.5 text-[12px] font-bold tracking-wide uppercase"
          >
            Learn more
          </Link>
        </div>
      </div>
    </article>
  );
}
