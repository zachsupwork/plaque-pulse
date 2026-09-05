import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Field } from "@/components/taplocal/Field";
import { BrandLockup } from "@/components/taplocal/Brand";
import { OfferingCard } from "@/components/taplocal/OfferingCard";
import { InterestForm } from "@/components/taplocal/InterestForm";
import { listOfferings, type Offering } from "@/lib/offerings.functions";

export const Route = createFileRoute("/smartplaques")({
  head: () => ({
    meta: [
      { title: "SmartPlaques — TapLocal" },
      {
        name: "description",
        content:
          "TapLocal SmartPlaques: tap-to-review, tap-to-follow and universal plaques with NFC and QR built in.",
      },
      { property: "og:title", content: "SmartPlaques — TapLocal" },
      {
        property: "og:description",
        content: "Tap-to-review, tap-to-follow and universal TapLocal SmartPlaques.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SmartPlaquesPage,
});

function SmartPlaquesPage() {
  const listFn = useServerFn(listOfferings);
  const { data, isPending } = useQuery({ queryKey: ["offerings"], queryFn: () => listFn() });
  const [interest, setInterest] = useState<Offering | null>(null);

  const plaques = (data?.offerings ?? []).filter(
    (o) => o.category === "smartplaques" || o.category === "packages" || o.category === "custom",
  );

  return (
    <Field>
      <div className="mx-auto max-w-5xl px-5 pt-8 pb-20">
        <Link to="/" aria-label="TapLocal home" className="inline-block">
          <BrandLockup suffix="Digital" />
        </Link>

        <h1 className="mt-6 font-display text-[28px] leading-tight font-bold tracking-tight text-balance">
          TapLocal SmartPlaques
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground text-pretty">
          A plaque on the counter with NFC and a QR code inside. Customers tap, and they land exactly where you
          want them — reviews, Instagram, your menu or anywhere else.
        </p>

        {isPending ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-foreground/[0.06]" />
            ))}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plaques.map((o) => (
              <OfferingCard key={o.id} offering={o} onInterested={() => setInterest(o)} />
            ))}
          </div>
        )}

        <Link to="/offerings" className="mt-8 inline-block text-[14px] font-semibold text-primary">
          View all offerings →
        </Link>
      </div>

      {interest ? (
        <InterestForm
          offeringId={interest.id}
          offeringName={interest.name}
          physical={interest.metadata?.physical !== false}
          onClose={() => setInterest(null)}
        />
      ) : null}
    </Field>
  );
}
