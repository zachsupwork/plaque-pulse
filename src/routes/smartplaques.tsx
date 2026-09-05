import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Field, GlassPanel } from "@/components/taplocal/Field";
import { BrandLockup } from "@/components/taplocal/Brand";
import { InterestForm } from "@/components/taplocal/InterestForm";
import { OfferingCard } from "@/components/taplocal/OfferingCard";
import {
  ProductSection,
  OptionSwatches,
  ProductImage,
  type Selections,
} from "@/components/taplocal/Product";
import { listOfferings, optionList, type Offering } from "@/lib/offerings.functions";
import plaqueTrio from "@/assets/plaque-trio.jpg";

export const Route = createFileRoute("/smartplaques")({
  head: () => ({
    meta: [
      { title: "SmartPlaques — TapLocal" },
      {
        name: "description",
        content:
          "See the TapLocal SmartPlaques: Google review, Instagram and premium black marble Universal plaques with NFC and QR built in, plus 2-plaque and 4-plaque business packs.",
      },
      { property: "og:title", content: "SmartPlaques — TapLocal" },
      {
        property: "og:description",
        content: "Google, Instagram and Universal SmartPlaques, finishes, bases and business packs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SmartPlaquesPage,
});

const INCLUDED = [
  { n: "1", t: "The physical SmartPlaque", b: "Premium acrylic, printed face, ready to stand on a counter." },
  { n: "2", t: "Preprogrammed NFC chip", b: "Laminated inside. Nothing for you to program." },
  { n: "3", t: "Unique QR code", b: "Paired to the same plaque, for phones that prefer to scan." },
  { n: "4", t: "Permanent SmartLink identity", b: "The plaque's own address, for life." },
  { n: "5", t: "Initial business setup", b: "We point it at the right destination before it ships." },
  { n: "6", t: "TapLocal management", b: "Change the destination later without new hardware." },
  { n: "7", t: "Activity tracking", b: "Taps and scans, counted per plaque where available." },
  { n: "8", t: "Owner portal access", b: "Optional — see your plaques and activity any time." },
];

const ANATOMY = [
  { label: "Front", body: "The customer-facing printed design." },
  { label: "Inside", body: "The preprogrammed NFC chip." },
  { label: "Back", body: "The unique QR and setup layer." },
  { label: "Outer back", body: "A “Tap here” cover sticker." },
];

const FLOW = [
  { t: "Physical plaque", b: "A customer taps or scans." },
  { t: "TapLocal SmartLink", b: "The plaque's own permanent address." },
  { t: "Google / Instagram / menu", b: "Wherever you point it today." },
  { t: "TapLocal activity", b: "The interaction is counted for that plaque." },
];

function SmartPlaquesPage() {
  const listFn = useServerFn(listOfferings);
  const { data, isPending } = useQuery({ queryKey: ["offerings"], queryFn: () => listFn() });
  const [interest, setInterest] = useState<{ offering: Offering; selections: Selections } | null>(null);

  const all = data?.offerings ?? [];
  const plaques = all.filter((o) => o.category === "smartplaques");
  const packs = all.filter((o) => o.category === "packages");
  const custom = all.filter((o) => o.category === "custom");

  const finishes = optionList(
    all.find((o) => o.slug === "custom-business-pack")?.metadata?.finishes ??
      plaques[0]?.metadata?.finishes,
  );
  const bases = optionList(plaques[0]?.metadata?.bases);

  const open = (offering: Offering) => (selections: Selections) => setInterest({ offering, selections });

  return (
    <Field>
      <div className="mx-auto max-w-6xl px-5 pt-8 pb-24">
        <Link to="/" aria-label="TapLocal home" className="inline-block">
          <BrandLockup suffix="Digital" />
        </Link>

        <section className="mt-6 md:grid md:grid-cols-2 md:items-center md:gap-12">
          <div>
            <p className="text-[12px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
              SmartPlaques
            </p>
            <h1 className="mt-2 font-display text-[30px] leading-tight font-bold tracking-tight text-balance md:text-[42px]">
              One tap. Whatever action matters to your business.
            </h1>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground text-pretty">
              A premium acrylic plaque on the counter with NFC inside and a QR code on the back. Customers
              tap and land exactly where you want them — reviews, Instagram, your menu or anywhere else.
            </p>
          </div>
          <img
            src={plaqueTrio}
            alt="Three TapLocal SmartPlaques: white marble Google review, soft pink Instagram and black marble premium"
            width={1600}
            height={1104}
            className="mt-6 w-full rounded-3xl md:mt-0"
          />
        </section>

        {isPending ? (
          <div className="mt-12 h-72 animate-pulse rounded-3xl bg-foreground/[0.06]" />
        ) : (
          <>
            {plaques.map((o, i) => (
              <ProductSection key={o.id} offering={o} flip={i % 2 === 1} onInterested={open(o)} />
            ))}

            <section className="mt-20">
              <p className="text-[12px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                SmartPlaque packs
              </p>
              <h2 className="mt-2 max-w-xl font-display text-[26px] leading-tight font-bold tracking-tight md:text-[34px]">
                One business. More than one place to tap.
              </h2>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground text-pretty">
                Every plaque in a pack still gets its own unique TapLocal SmartLink, so TapLocal can measure
                which physical placement actually gets used.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {packs.map((o) => (
                  <OfferingCard key={o.id} offering={o} onInterested={() => setInterest({ offering: o, selections: {} })} />
                ))}
              </div>
            </section>

            {packs.map((o, i) => (
              <ProductSection key={`s-${o.id}`} offering={o} flip={i % 2 === 1} onInterested={open(o)} />
            ))}

            {custom.map((o) => (
              <ProductSection key={o.id} offering={o} flip onInterested={open(o)} />
            ))}

            <section className="mt-20">
              <h2 className="font-display text-[26px] leading-tight font-bold tracking-tight md:text-[34px]">
                Choose your look.
              </h2>
              <div className="mt-5 grid gap-6 md:grid-cols-2">
                <OptionSwatches title="Finishes" options={finishes} />
                <OptionSwatches
                  title="Bases"
                  note="Not every base is available for every design — we confirm before production."
                  options={bases}
                />
              </div>
            </section>
          </>
        )}

        <section className="mt-20">
          <GlassPanel tone="frost" className="p-6 md:p-10">
            <h2 className="font-display text-[26px] leading-tight font-bold tracking-tight md:text-[34px]">
              What's included with every SmartPlaque.
            </h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {INCLUDED.map((i) => (
                <div key={i.n} className="rounded-2xl border border-border bg-card p-4">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 font-display text-[13px] font-bold text-primary">
                    {i.n}
                  </span>
                  <p className="mt-3 font-display text-[14px] font-bold tracking-tight">{i.t}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">{i.b}</p>
                </div>
              ))}
            </div>
          </GlassPanel>
        </section>

        <section className="mt-16 md:grid md:grid-cols-2 md:items-center md:gap-10">
          <ProductImage
            src="/__l5e/assets-v1/693ec3ab-112d-4f65-b3e4-a63d8d076db9/anatomy.jpg"
            alt="A SmartPlaque shown from the front, with the NFC chip inside, the QR on the back and a cover sticker"
            className="w-full"
          />
          <div className="mt-6 md:mt-0">
            <h2 className="font-display text-[24px] leading-tight font-bold tracking-tight md:text-[30px]">
              Front, chip, QR, sticker.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">
              Customers normally tap the plaque. The hidden QR on the back gives an extra way to identify,
              set up or recover it. Private activation details are never printed on the customer-facing side.
            </p>
            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {ANATOMY.map((a) => (
                <div key={a.label} className="rounded-2xl border border-border bg-card p-4">
                  <div className="gradient-rule w-10" />
                  <p className="mt-2.5 font-display text-[13px] font-bold tracking-[0.06em] uppercase">
                    {a.label}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-16 md:grid md:grid-cols-2 md:items-center md:gap-10">
          <div>
            <h2 className="font-display text-[24px] leading-tight font-bold tracking-tight md:text-[30px]">
              More than a sticker with a chip.
            </h2>
            <div className="mt-5 space-y-2.5">
              {FLOW.map((f, i) => (
                <div key={f.t} className="rounded-2xl border border-border bg-card p-4">
                  <p className="font-display text-[14px] font-bold tracking-tight">{f.t}</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">{f.b}</p>
                  {i < FLOW.length - 1 ? (
                    <span aria-hidden="true" className="mt-2 block text-[13px] text-primary">
                      ↓
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground text-pretty">
              Change where a plaque goes without replacing it, see how often customers interact, and compare
              different physical placements.
            </p>
          </div>
          <div className="mt-6 md:order-first md:mt-0">
            <ProductImage
              src="/__l5e/assets-v1/0e11bffb-ebdd-4fc8-998f-49a971999d80/portal.jpg"
              alt="A phone showing a sample TapLocal activity view beside a white marble SmartPlaque"
              className="w-full"
            />
            <p className="mt-2 text-[12px] text-muted-foreground">
              Sample portal view — not real customer data.
            </p>
          </div>
        </section>

        <div className="mt-14 flex flex-wrap gap-3">
          <Link
            to="/offerings"
            className="rounded-xl border border-border bg-card px-5 py-3.5 text-[13px] font-bold tracking-wide uppercase"
          >
            View the full catalog
          </Link>
          <Link
            to="/activate"
            className="rounded-xl bg-primary px-5 py-3.5 text-[13px] font-bold tracking-wide text-primary-foreground uppercase"
          >
            Activate my plaque
          </Link>
        </div>

        <p className="mt-10 text-[12px] text-muted-foreground">
          Product images are high-quality visual mockups while the designs are being finalised, not
          photographs of a delivered unit.
        </p>
      </div>

      {interest ? (
        <InterestForm
          offeringId={interest.offering.id}
          offeringName={interest.offering.name}
          physical={interest.offering.metadata?.physical !== false}
          selections={interest.selections}
          source="smartplaques"
          onClose={() => setInterest(null)}
        />
      ) : null}
    </Field>
  );
}
