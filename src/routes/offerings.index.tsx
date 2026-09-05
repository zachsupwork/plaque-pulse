import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Field } from "@/components/taplocal/Field";
import { BrandLockup } from "@/components/taplocal/Brand";
import { OfferingCard, CATEGORY_LABELS } from "@/components/taplocal/OfferingCard";
import { InterestForm } from "@/components/taplocal/InterestForm";
import { listOfferings, type Offering } from "@/lib/offerings.functions";

export const Route = createFileRoute("/offerings/")({
  head: () => ({
    meta: [
      { title: "SmartPlaques & services — TapLocal" },
      {
        name: "description",
        content:
          "Everything TapLocal offers: Google Review, Instagram and Universal SmartPlaques, multi-plaque packs, custom plaques and setup services.",
      },
      { property: "og:title", content: "SmartPlaques & services — TapLocal" },
      {
        property: "og:description",
        content: "Explore TapLocal SmartPlaques, packs, custom plaques and business services.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OfferingsPage,
});

const ORDER = ["smartplaques", "packages", "custom", "services"];

function OfferingsPage() {
  const listFn = useServerFn(listOfferings);
  const { data, isPending } = useQuery({ queryKey: ["offerings"], queryFn: () => listFn() });
  const [interest, setInterest] = useState<Offering | null>(null);
  const [category, setCategory] = useState<string>("all");

  const offerings = data?.offerings ?? [];
  const categories = ORDER.filter((c) => offerings.some((o) => o.category === c));
  const shown = category === "all" ? offerings : offerings.filter((o) => o.category === category);

  return (
    <Field>
      <div className="mx-auto max-w-5xl px-5 pt-8 pb-20">
        <Link to="/" aria-label="TapLocal home" className="inline-block">
          <BrandLockup suffix="Digital" />
        </Link>

        <h1 className="mt-6 font-display text-[28px] leading-tight font-bold tracking-tight text-balance">
          What TapLocal can do for your business
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground text-pretty">
          Physical plaques customers tap, plus the setup work behind them. Tell us what looks right and we'll
          help you figure out the rest — no checkout, no card.
        </p>

        {categories.length > 1 ? (
          <div className="mt-5 flex flex-wrap gap-1.5">
            {["all", ...categories].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-xl border px-3.5 py-2 text-[13px] font-semibold ${
                  category === c ? "border-primary bg-primary/10 text-primary" : "border-border"
                }`}
              >
                {c === "all" ? "Everything" : (CATEGORY_LABELS[c] ?? c)}
              </button>
            ))}
          </div>
        ) : null}

        {isPending ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-foreground/[0.06]" />
            ))}
          </div>
        ) : shown.length ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((o) => (
              <OfferingCard key={o.id} offering={o} onInterested={() => setInterest(o)} />
            ))}
          </div>
        ) : (
          <p className="mt-8 text-[14px] text-muted-foreground">Nothing listed here yet.</p>
        )}

        <div className="mt-10 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-[18px] font-bold tracking-tight">Not sure what you need?</h2>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Tell us about your business and we'll suggest a setup.
          </p>
          <button
            type="button"
            onClick={() =>
              setInterest({
                id: "",
                name: "TapLocal",
                slug: "",
                category: "custom",
                short_description: "",
                full_description: null,
                image_url: null,
                icon: null,
                featured: false,
                sort_order: 0,
                cta_label: "Talk to TapLocal",
                starting_price_text: null,
                metadata: {},
              })
            }
            className="mt-4 rounded-xl bg-primary px-4 py-3 text-[13px] font-bold tracking-wide text-primary-foreground uppercase"
          >
            Talk to TapLocal
          </button>
        </div>
      </div>

      {interest ? (
        <InterestForm
          offeringId={interest.id || null}
          offeringName={interest.name}
          physical={interest.metadata?.physical !== false}
          onClose={() => setInterest(null)}
        />
      ) : null}
    </Field>
  );
}
