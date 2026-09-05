import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Field, GlassPanel } from "@/components/taplocal/Field";
import { BrandLockup } from "@/components/taplocal/Brand";
import { InterestForm } from "@/components/taplocal/InterestForm";
import { CATEGORY_LABELS } from "@/components/taplocal/OfferingCard";
import { getOffering } from "@/lib/offerings.functions";

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
  const [open, setOpen] = useState(false);

  const o = data?.offering;
  if (!o) return <Missing />;

  const styles = o.metadata?.styles ?? [];
  const bases = o.metadata?.bases ?? [];
  const physical = o.metadata?.physical !== false;

  return (
    <Field>
      <div className="mx-auto max-w-2xl px-5 pt-8 pb-24">
        <Link to="/" aria-label="TapLocal home" className="inline-block">
          <BrandLockup suffix="Digital" />
        </Link>

        <Link to="/offerings" className="mt-6 block text-[13px] text-muted-foreground">
          ← All offerings
        </Link>

        <p className="mt-4 text-[11px] font-bold tracking-[0.12em] text-primary uppercase">
          {CATEGORY_LABELS[o.category] ?? o.category}
        </p>
        <h1 className="mt-1 font-display text-[28px] leading-tight font-bold tracking-tight text-balance">
          {o.name}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground text-pretty">
          {o.short_description}
        </p>

        {o.image_url ? (
          <img src={o.image_url} alt={o.name} className="mt-5 w-full rounded-2xl object-cover" />
        ) : (
          <div className="mt-5 h-2 w-full rounded-full bg-gradient-to-r from-primary/70 via-accent/60 to-primary/30" />
        )}

        {o.full_description ? (
          <GlassPanel className="mt-5 p-5">
            <h2 className="font-display text-[16px] font-bold tracking-tight">What it is</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground text-pretty">
              {o.full_description}
            </p>
          </GlassPanel>
        ) : null}

        {styles.length || bases.length ? (
          <GlassPanel className="mt-4 p-5">
            <h2 className="font-display text-[16px] font-bold tracking-tight">Options</h2>
            {styles.length ? (
              <div className="mt-3">
                <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Styles</p>
                <p className="mt-1 text-[14px]">{styles.join(" · ")}</p>
              </div>
            ) : null}
            {bases.length ? (
              <div className="mt-3">
                <p className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Bases</p>
                <p className="mt-1 text-[14px]">{bases.join(" · ")}</p>
              </div>
            ) : null}
          </GlassPanel>
        ) : null}

        {o.starting_price_text ? (
          <p className="mt-4 text-[15px] font-bold">{o.starting_price_text}</p>
        ) : null}

        <div className="sticky bottom-4 mt-6 space-y-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-xl bg-primary px-5 py-3.5 text-[14px] font-bold tracking-wide text-primary-foreground uppercase shadow-[var(--shadow-brand)]"
          >
            {o.cta_label}
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-xl border border-border bg-card px-5 py-3.5 text-[13px] font-bold tracking-wide uppercase"
          >
            Get pricing
          </button>
        </div>
      </div>

      {open ? (
        <InterestForm
          offeringId={o.id}
          offeringName={o.name}
          physical={physical}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </Field>
  );
}
