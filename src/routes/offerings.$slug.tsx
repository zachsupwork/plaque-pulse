import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Field, GlassPanel } from "@/components/taplocal/Field";
import { BrandLockup } from "@/components/taplocal/Brand";
import { InterestForm } from "@/components/taplocal/InterestForm";
import { CATEGORY_LABELS } from "@/components/taplocal/OfferingCard";
import {
  FeatureList,
  OptionSwatches,
  ProductGallery,
  VariantPicker,
  type Selections,
} from "@/components/taplocal/Product";
import { getOffering, optionList } from "@/lib/offerings.functions";

export const Route = createFileRoute("/offerings/$slug")({
  loader: ({ params }) => getOffering({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    const o = loaderData?.offering;
    if (!o) {
      return { meta: [{ title: "Not found — TapLocal" }, { name: "robots", content: "noindex" }] };
    }
    const title = `${o.name} — TapLocal`;
    const description = o.short_description || "A TapLocal offering.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => <Missing />,
  notFoundComponent: () => <Missing />,
  component: OfferingDetail,
});

function Missing() {
  return (
    <Field>
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-[22px] font-bold tracking-tight">We couldn't find that</h1>
        <Link to="/offerings" className="mt-4 inline-block text-[14px] font-semibold text-primary">
          See everything TapLocal offers
        </Link>
      </div>
    </Field>
  );
}

function OfferingDetail() {
  const { slug } = Route.useParams();
  const initial = Route.useLoaderData();
  const fetchOne = useServerFn(getOffering);
  const { data } = useQuery({
    queryKey: ["offering", slug],
    queryFn: () => fetchOne({ data: { slug } }),
    initialData: initial,
  });
  const [selections, setSelections] = useState<Selections | null>(null);

  const o = data?.offering;
  if (!o) return <Missing />;

  const meta = o.metadata ?? {};
  const physical = meta.physical !== false;
  const finishes = optionList(meta.finishes ?? meta.styles);
  const bases = optionList(meta.bases);

  return (
    <Field>
      <div className="mx-auto max-w-5xl px-5 pt-8 pb-24">
        <Link to="/" aria-label="TapLocal home" className="inline-block">
          <BrandLockup suffix="Digital" />
        </Link>

        <Link to="/offerings" className="mt-6 block text-[13px] text-muted-foreground">
          ← All offerings
        </Link>

        <div className="mt-4 grid gap-8 md:grid-cols-2 md:gap-12">
          <ProductGallery offering={o} />

          <div>
            <p className="text-[11px] font-bold tracking-[0.12em] text-primary uppercase">
              {CATEGORY_LABELS[o.category] ?? o.category}
            </p>
            <h1 className="mt-1 font-display text-[28px] leading-tight font-bold tracking-tight text-balance md:text-[34px]">
              {o.name}
            </h1>
            {meta.tagline ? (
              <p className="mt-2 text-[12px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                {meta.tagline}
              </p>
            ) : null}
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">
              {o.short_description}
            </p>
            <FeatureList features={meta.features} />
            <p className="mt-4 text-[15px] font-bold">
              {o.starting_price_text || (
                <span className="font-semibold text-muted-foreground">Contact for pricing</span>
              )}
            </p>

            <div className="mt-6">
              <VariantPicker offering={o} onInterested={(s) => setSelections(s)} />
            </div>
          </div>
        </div>

        {o.full_description ? (
          <GlassPanel className="mt-10 p-5 md:p-7">
            <h2 className="font-display text-[18px] font-bold tracking-tight">What it is</h2>
            <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted-foreground text-pretty">
              {o.full_description}
            </p>
          </GlassPanel>
        ) : null}

        {finishes.length || bases.length ? (
          <section className="mt-8 grid gap-6 md:grid-cols-2">
            <OptionSwatches title="Finishes" options={finishes} />
            <OptionSwatches
              title="Bases"
              note="Not every base is available for every design — we confirm before production."
              options={bases}
            />
          </section>
        ) : null}

        {physical ? (
          <p className="mt-10 text-[12px] text-muted-foreground">
            Product images are high-quality visual mockups while the designs are being finalised, not
            photographs of a delivered unit.
          </p>
        ) : null}

        <Link to="/smartplaques" className="mt-6 inline-block text-[14px] font-semibold text-primary">
          See all SmartPlaques →
        </Link>
      </div>

      {selections ? (
        <InterestForm
          offeringId={o.id}
          offeringName={o.name}
          physical={physical}
          selections={selections}
          source="offering_detail"
          onClose={() => setSelections(null)}
        />
      ) : null}
    </Field>
  );
}
