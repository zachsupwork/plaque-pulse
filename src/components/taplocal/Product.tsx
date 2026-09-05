import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { optionList, type Offering, type OptionImage } from "@/lib/offerings.functions";

/**
 * The visual product language for TapLocal: every physical offering is shown
 * as a photographed acrylic plaque first, words second. Everything here is fed
 * from the offerings table, so staff can swap imagery without a code change.
 */

export function ProductImage({
  src,
  alt,
  className = "",
  eager = false,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  if (!src) {
    return (
      <div className={`cloud-surface grid place-items-center rounded-2xl ${className}`}>
        <span className="gradient-rule w-16" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      className={`rounded-2xl bg-foreground/[0.03] object-contain ${className}`}
    />
  );
}

export function FeatureList({ features }: { features?: string[] | undefined }) {
  if (!features?.length) return null;
  return (
    <ul className="mt-4 space-y-1.5">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-[14px] leading-relaxed">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="text-muted-foreground">{f}</span>
        </li>
      ))}
    </ul>
  );
}

/** Visual swatch row for finishes and bases. */
export function OptionSwatches({
  title,
  note,
  options,
  selected,
  onSelect,
}: {
  title: string;
  note?: string;
  options: OptionImage[];
  selected?: string;
  onSelect?: (name: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div>
      <p className="text-[12px] font-bold tracking-[0.12em] text-muted-foreground uppercase">{title}</p>
      {note ? <p className="mt-1 text-[13px] text-muted-foreground">{note}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2.5">
        {options.map((o) => {
          const active = selected === o.name;
          const inner = (
            <>
              {o.image ? (
                <img
                  src={o.image}
                  alt={o.name}
                  loading="lazy"
                  className="h-24 w-20 rounded-xl object-cover"
                />
              ) : (
                <span className="cloud-surface block h-24 w-20 rounded-xl" />
              )}
              <span className="mt-2 block text-[12px] font-semibold">{o.name}</span>
            </>
          );
          return onSelect ? (
            <button
              key={o.name}
              type="button"
              onClick={() => onSelect(o.name)}
              aria-pressed={active}
              className={`rounded-2xl border p-2 text-center ${
                active ? "border-primary bg-primary/5" : "border-border bg-card"
              }`}
            >
              {inner}
            </button>
          ) : (
            <div key={o.name} className="rounded-2xl border border-border bg-card p-2 text-center">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChoiceRow({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: string[];
  value?: string;
  onChange: (v: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div>
      <p className="text-[12px] font-bold tracking-[0.12em] text-muted-foreground uppercase">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={value === o}
            className={`rounded-xl border px-3.5 py-2 text-[13px] font-semibold ${
              value === o ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiRow({
  title,
  options,
  values,
  onToggle,
}: {
  title: string;
  options: string[];
  values: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-[12px] font-bold tracking-[0.12em] text-muted-foreground uppercase">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            aria-pressed={values.includes(o)}
            className={`rounded-xl border px-3.5 py-2 text-[13px] font-semibold ${
              values.includes(o) ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export type Selections = Record<string, string>;

const PURPOSES = ["Google Reviews", "Instagram", "Website", "Menu", "Booking", "Not sure"];

/**
 * Lets a visitor pick finish, base and quantity before raising their hand — the
 * choices travel with the lead so TapLocal can quote without a phone call.
 */
export function VariantPicker({
  offering,
  onInterested,
  compact = false,
}: {
  offering: Offering;
  onInterested: (selections: Selections) => void;
  compact?: boolean;
}) {
  const meta = offering.metadata ?? {};
  const finishes = useMemo(() => optionList(meta.finishes ?? meta.styles), [meta.finishes, meta.styles]);
  const bases = useMemo(() => optionList(meta.bases), [meta.bases]);
  const builder = meta.builder === true;

  const [finish, setFinish] = useState<string>("");
  const [base, setBase] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [design, setDesign] = useState<string>("");
  const [locations, setLocations] = useState<string>("");
  const [purposes, setPurposes] = useState<string[]>([]);

  const quantities = meta.quantities ?? (builder ? ["1", "2", "4", "5+"] : []);

  function submit() {
    const s: Selections = {};
    if (finish) s["Finish"] = finish;
    if (base) s["Base"] = base;
    if (quantity) s["Quantity"] = quantity;
    if (design) s["Designs"] = design;
    if (locations) s["Locations"] = locations;
    if (purposes.length) s["Wanted for"] = purposes.join(", ");
    if (meta.quantity && !quantity) s["Quantity"] = String(meta.quantity);
    onInterested(s);
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      {finishes.length ? (
        <OptionSwatches title="Finish" options={finishes} selected={finish} onSelect={setFinish} />
      ) : null}
      {bases.length ? (
        <OptionSwatches
          title="Base"
          note="Not every base suits every design — we'll confirm what's available."
          options={bases}
          selected={base}
          onSelect={setBase}
        />
      ) : null}
      {quantities.length ? (
        <ChoiceRow
          title={builder ? "How many plaques?" : "Quantity"}
          options={[...quantities, ...(quantities.includes("Not sure") ? [] : ["Not sure"])]}
          value={quantity}
          onChange={setQuantity}
        />
      ) : null}
      {builder ? (
        <MultiRow
          title="What do you want them for?"
          options={PURPOSES}
          values={purposes}
          onToggle={(v) =>
            setPurposes((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))
          }
        />
      ) : null}
      {meta.designs?.length ? (
        <ChoiceRow title="Designs" options={meta.designs} value={design} onChange={setDesign} />
      ) : null}
      {meta.locations?.length || builder ? (
        <ChoiceRow
          title="Number of locations"
          options={meta.locations ?? ["1", "2", "3+"]}
          value={locations}
          onChange={setLocations}
        />
      ) : null}

      <button
        type="button"
        onClick={submit}
        className="w-full rounded-xl bg-primary px-5 py-3.5 text-[14px] font-bold tracking-wide text-primary-foreground uppercase shadow-[var(--shadow-brand)]"
      >
        {builder ? "Request my setup" : offering.cta_label}
      </button>
    </div>
  );
}

/**
 * A full-width product section: photo on one side, the story and the options on
 * the other, alternating direction down the page.
 */
export function ProductSection({
  offering,
  flip = false,
  onInterested,
}: {
  offering: Offering;
  flip?: boolean;
  onInterested: (selections: Selections) => void;
}) {
  const meta = offering.metadata ?? {};
  return (
    <section id={offering.slug} className="mt-14 md:mt-20">
      <div className="grid items-center gap-6 md:grid-cols-2 md:gap-12">
        <div className={flip ? "md:order-2" : ""}>
          <ProductImage
            src={offering.image_url}
            alt={offering.name}
            className="max-h-[520px] w-full"
          />
        </div>
        <div className={flip ? "md:order-1" : ""}>
          <h2 className="font-display text-[24px] leading-tight font-bold tracking-tight text-balance md:text-[32px]">
            {offering.name}
          </h2>
          {meta.tagline ? (
            <p className="mt-2 text-[12px] font-bold tracking-[0.1em] text-primary uppercase">
              {meta.tagline}
            </p>
          ) : null}
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">
            {offering.full_description || offering.short_description}
          </p>
          <FeatureList features={meta.features} />
          {offering.starting_price_text ? (
            <p className="mt-4 text-[15px] font-bold">{offering.starting_price_text}</p>
          ) : (
            <p className="mt-4 text-[13px] text-muted-foreground">Contact for pricing.</p>
          )}

          <div className="mt-5">
            <VariantPicker offering={offering} onInterested={onInterested} compact />
            <Link
              to="/offerings/$slug"
              params={{ slug: offering.slug }}
              className="mt-2 block rounded-xl border border-border bg-card px-5 py-3.5 text-center text-[13px] font-bold tracking-wide uppercase"
            >
              View details
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Main image plus selectable thumbnails, straight from the offering gallery. */
export function ProductGallery({ offering }: { offering: Offering }) {
  const gallery = offering.metadata?.gallery ?? [];
  const images = gallery.length
    ? gallery
    : offering.image_url
      ? [{ url: offering.image_url, caption: offering.name }]
      : [];
  const [index, setIndex] = useState(0);
  if (!images.length) return null;
  const current = images[Math.min(index, images.length - 1)]!;

  return (
    <div>
      <ProductImage src={current.url} alt={current.caption || offering.name} className="w-full" eager />
      {current.caption ? (
        <p className="mt-2 text-[12px] text-muted-foreground">{current.caption}</p>
      ) : null}
      {images.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((g, i) => (
            <button
              key={g.url + i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={g.caption || `Image ${i + 1}`}
              aria-pressed={i === index}
              className={`overflow-hidden rounded-xl border ${
                i === index ? "border-primary" : "border-border"
              }`}
            >
              <img src={g.url} alt="" loading="lazy" className="h-16 w-20 object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
