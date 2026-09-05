import { Link } from "@tanstack/react-router";
import type { Offering } from "@/lib/offerings.functions";

export const CATEGORY_LABELS: Record<string, string> = {
  smartplaques: "SmartPlaques",
  services: "Services",
  packages: "Packages",
  custom: "Custom",
};

export function OfferingCard({ offering, onInterested }: { offering: Offering; onInterested: () => void }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
      {offering.image_url ? (
        <img
          src={offering.image_url}
          alt={offering.name}
          loading="lazy"
          className="h-40 w-full object-cover"
        />
      ) : (
        <div className="h-1.5 w-full bg-gradient-to-r from-primary/70 via-accent/60 to-primary/30" />
      )}
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
          {CATEGORY_LABELS[offering.category] ?? offering.category}
        </p>
        <h3 className="mt-1 font-display text-[17px] leading-tight font-bold tracking-tight">{offering.name}</h3>
        <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {offering.short_description}
        </p>
        {offering.starting_price_text ? (
          <p className="mt-2 text-[13px] font-bold">{offering.starting_price_text}</p>
        ) : null}
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
