import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Field } from "@/components/taplocal/Field";
import { BrandLockup } from "@/components/taplocal/Brand";
import { OfferingCard, CATEGORY_LABELS } from "@/components/taplocal/OfferingCard";
import { InterestForm } from "@/components/taplocal/InterestForm";
import { listOfferings, type Offering } from "@/lib/offerings.functions";
import plaqueTrio from "@/assets/plaque-trio.jpg";

export const Route = createFileRoute("/offerings/")({
  head: () => ({
    meta: [
      { title: "SmartPlaques & services — TapLocal catalog" },
      {
        name: "description",
        content:
          "The full TapLocal catalog: Google review, Instagram and Universal SmartPlaques, 2-plaque and 4-plaque business packs, multi-location and custom packs, plus setup services.",
      },
      { property: "og:title", content: "SmartPlaques & services — TapLocal catalog" },
      {
        property: "og:description",
        content: "Plaques, packs, custom setups and business services from TapLocal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OfferingsPage,
});

const ORDER = ["smartplaques", "packages", "custom", "services"];
const FILTER_LABELS: Record<string, string> = {
  all: "All",
  smartplaques: "SmartPlaques",
  packages: "Packs",
  custom: "Custom",
  services: "Business services",
};

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
      <div className="mx-auto max-w-6xl px-5 pt-8 pb-24">
        <Link to="/" aria-label="TapLocal home" className="inline-block">
          <BrandLockup suffix="Digital" />
        </Link>

        <section className="mt-6 md:grid md:grid-cols-2 md:items-center md:gap-12">
          <div>
            <h1 className="font-display text-[30px] leading-tight font-bold tracking-tight text-balance md:text-[40px]">
              What TapLocal can do for your business
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground text-pretty">
              Physical plaques customers tap, packs for busier rooms, and the setup work behind them. Tell us
              what looks right and we'll help you figure out the rest — no checkout, no card.
            </p>
          </div>
          <img
            src={plaqueTrio}
            alt="Three TapLocal SmartPlaques standing together on a counter"
            width={1600}
            height={1104}
            className="mt-6 w-full rounded-3xl md:mt-0"
          />
        </section>

        {categories.length > 1 ? (
          <div className="mt-8 flex flex-wrap gap-1.5">
            {["all", ...categories].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-xl border px-3.5 py-2 text-[13px] font-bold tracking-wide uppercase ${
                  category === c ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"
                }`}
              >
                {FILTER_LABELS[c] ?? CATEGORY_LABELS[c] ?? c}
              </button>
            ))}
          </div>
        ) : null}

        {isPending ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-2xl bg-foreground/[0.06]" />
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

        <div className="mt-10 rounded-2xl border border-border bg-card p-5 md:p-7">
          <h2 className="font-display text-[20px] font-bold tracking-tight">Not sure what you need?</h2>
          <p className="mt-1.5 max-w-xl text-[14px] text-muted-foreground text-pretty">
            Tell us about your business and we'll suggest a setup — how many plaques, where to put them and
            what each one should do.
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

        <p className="mt-10 text-[12px] text-muted-foreground">
          Product images are high-quality visual mockups while the designs are being finalised.
        </p>
      </div>

      {interest ? (
        <InterestForm
          offeringId={interest.id || null}
          offeringName={interest.name}
          physical={interest.metadata?.physical !== false}
          source="catalog"
          onClose={() => setInterest(null)}
        />
      ) : null}
    </Field>
  );
}
