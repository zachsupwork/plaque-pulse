import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, StatusChip } from "@/components/taplocal/Field";
import { adminListOfferings, saveOffering, setOfferingActive } from "@/lib/inquiries.functions";

export const Route = createFileRoute("/admin/offerings")({
  head: () => ({
    meta: [
      { title: "Catalog — TapLocal admin" },
      { name: "description", content: "Add, edit and retire what TapLocal offers publicly." },
      { property: "og:title", content: "Catalog — TapLocal admin" },
      { property: "og:description", content: "Add, edit and retire what TapLocal offers publicly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CatalogAdmin,
});

type Draft = {
  id?: string;
  name: string;
  slug: string;
  category: "smartplaques" | "services" | "packages" | "custom";
  short_description: string;
  full_description: string;
  image_url: string;
  cta_label: string;
  starting_price_text: string;
  sort_order: number;
  active: boolean;
  featured: boolean;
  tagline: string;
  features: string;
  finishes: string;
  bases: string;
  quantities: string;
  gallery: string;
};

const lines = (v: unknown) =>
  Array.isArray(v)
    ? v
        .map((x) => (typeof x === "string" ? x : ((x as { name?: string; url?: string })?.name ?? (x as { url?: string })?.url ?? "")))
        .filter(Boolean)
        .join("\n")
    : "";
const toList = (v: string) =>
  v
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

const EMPTY: Draft = {
  name: "",
  slug: "",
  category: "smartplaques",
  short_description: "",
  full_description: "",
  image_url: "",
  cta_label: "I'm interested",
  starting_price_text: "",
  sort_order: 100,
  active: true,
  featured: false,
  tagline: "",
  features: "",
  finishes: "",
  bases: "",
  quantities: "",
  gallery: "",
};

const input =
  "w-full rounded-xl border border-border bg-foreground/[0.04] px-3 py-2.5 text-[14px] outline-none focus:border-primary/60";

function CatalogAdmin() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(adminListOfferings);
  const saveFn = useServerFn(saveOffering);
  const toggleFn = useServerFn(setOfferingActive);

  const { data, isPending } = useQuery({ queryKey: ["admin-offerings"], queryFn: () => listFn({ data: undefined }) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const offerings = data?.ok ? data.offerings : [];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-offerings"] });
    await queryClient.invalidateQueries({ queryKey: ["offerings"] });
  }

  async function save() {
    if (!draft) return;
    setError(null);
    const res = await saveFn({
      data: {
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name,
        slug: draft.slug,
        category: draft.category,
        short_description: draft.short_description,
        full_description: draft.full_description,
        image_url: draft.image_url,
        cta_label: draft.cta_label,
        starting_price_text: draft.starting_price_text,
        sort_order: draft.sort_order,
        active: draft.active,
        featured: draft.featured,
        tagline: draft.tagline,
        features: toList(draft.features),
        finishes: toList(draft.finishes),
        bases: toList(draft.bases),
        quantities: toList(draft.quantities),
        gallery: toList(draft.gallery),
      },
    }).catch(() => ({ ok: false as const }));
    if (!res.ok) {
      setError("Couldn't save. Check the name and web address (lowercase letters, numbers and dashes).");
      return;
    }
    setDraft(null);
    await refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold tracking-tight">Catalog</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">What visitors can see and ask about.</p>
        </div>
        <button
          type="button"
          onClick={() => setDraft({ ...EMPTY })}
          className="rounded-xl bg-primary px-3.5 py-2.5 text-[12px] font-bold tracking-wide text-primary-foreground uppercase"
        >
          + Add offering
        </button>
      </div>

      {draft ? (
        <GlassPanel className="space-y-2.5 p-4">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name"
            className={input}
          />
          <input
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
            placeholder="web-address-slug"
            className={input}
          />
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value as Draft["category"] })}
            className={input}
          >
            <option value="smartplaques">SmartPlaques</option>
            <option value="packages">Packages</option>
            <option value="custom">Custom</option>
            <option value="services">Services</option>
          </select>
          <input
            value={draft.short_description}
            onChange={(e) => setDraft({ ...draft, short_description: e.target.value })}
            placeholder="Short description"
            className={input}
          />
          <textarea
            value={draft.full_description}
            onChange={(e) => setDraft({ ...draft, full_description: e.target.value })}
            rows={4}
            placeholder="Full description"
            className={input}
          />
          <input
            value={draft.image_url}
            onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
            placeholder="Main image address"
            className={input}
          />
          {draft.image_url ? (
            <img
              src={draft.image_url}
              alt="Main product image preview"
              className="h-40 w-full rounded-xl border border-border object-cover"
            />
          ) : null}
          <textarea
            value={draft.gallery}
            onChange={(e) => setDraft({ ...draft, gallery: e.target.value })}
            rows={3}
            placeholder="Extra image addresses — one per line"
            className={input}
          />
          <input
            value={draft.tagline}
            onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
            placeholder="Tagline (optional)"
            className={input}
          />
          <textarea
            value={draft.features}
            onChange={(e) => setDraft({ ...draft, features: e.target.value })}
            rows={4}
            placeholder="What they get — one point per line"
            className={input}
          />
          <textarea
            value={draft.finishes}
            onChange={(e) => setDraft({ ...draft, finishes: e.target.value })}
            rows={3}
            placeholder="Finishes — one per line (Cloud White, Light Smoke…)"
            className={input}
          />
          <textarea
            value={draft.bases}
            onChange={(e) => setDraft({ ...draft, bases: e.target.value })}
            rows={2}
            placeholder="Bases — one per line (Clear Acrylic, Weighted Metal…)"
            className={input}
          />
          <input
            value={draft.quantities}
            onChange={(e) => setDraft({ ...draft, quantities: e.target.value })}
            placeholder="Quantity choices — one per line (1, 2, 4, Not sure)"
            className={input}
          />
          <input
            value={draft.cta_label}
            onChange={(e) => setDraft({ ...draft, cta_label: e.target.value })}
            placeholder="Button label"
            className={input}
          />
          <input
            value={draft.starting_price_text}
            onChange={(e) => setDraft({ ...draft, starting_price_text: e.target.value })}
            placeholder="Price text (optional, e.g. Contact for pricing)"
            className={input}
          />
          <input
            type="number"
            value={draft.sort_order}
            onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
            placeholder="Order"
            className={input}
          />
          <div className="flex gap-4 text-[13px] font-semibold">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              Visible publicly
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.featured}
                onChange={(e) => setDraft({ ...draft, featured: e.target.checked })}
              />
              Featured on homepage
            </label>
          </div>
          {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              className="flex-1 rounded-xl bg-primary px-4 py-3 text-[13px] font-bold tracking-wide text-primary-foreground uppercase"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-xl border border-border px-4 py-3 text-[13px] font-bold tracking-wide uppercase"
            >
              Cancel
            </button>
          </div>
        </GlassPanel>
      ) : null}

      {isPending ? (
        <div className="h-24 animate-pulse rounded-2xl bg-foreground/[0.06]" />
      ) : (
        <div className="space-y-2.5">
          {offerings.map((o) => {
            const meta = (o.metadata ?? {}) as Record<string, unknown>;
            return (
            <div key={o.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                {o.image_url ? (
                  <img
                    src={o.image_url}
                    alt={o.name}
                    className="h-14 w-14 shrink-0 rounded-xl border border-border object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[15px] font-bold tracking-tight">{o.name}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    /{o.slug} · {o.category} · order {o.sort_order}
                  </p>
                </div>
                <StatusChip tone={o.active ? "ok" : "idle"}>{o.active ? "PUBLIC" : "HIDDEN"}</StatusChip>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      id: o.id,
                      name: o.name,
                      slug: o.slug,
                      category: o.category as Draft["category"],
                      short_description: o.short_description ?? "",
                      full_description: o.full_description ?? "",
                      image_url: o.image_url ?? "",
                      cta_label: o.cta_label,
                      starting_price_text: o.starting_price_text ?? "",
                      sort_order: o.sort_order,
                      active: o.active,
                      featured: o.featured,
                      tagline: typeof meta.tagline === "string" ? meta.tagline : "",
                      features: lines(meta.features),
                      finishes: lines(meta.finishes ?? meta.styles),
                      bases: lines(meta.bases),
                      quantities: lines(meta.quantities),
                      gallery: lines(meta.gallery),
                    })
                  }
                  className="rounded-xl border border-border px-3.5 py-2 text-[12px] font-bold tracking-wide uppercase"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await toggleFn({ data: { id: o.id, active: !o.active } });
                    await refresh();
                  }}
                  className="rounded-xl border border-border px-3.5 py-2 text-[12px] font-bold tracking-wide uppercase"
                >
                  {o.active ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
