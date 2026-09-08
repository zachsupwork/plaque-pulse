import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, StatusChip } from "@/components/taplocal/Field";
import {
  AREA_CATEGORIES,
  createAreaBatch,
  discoverArea,
  listAreaSearches,
  processAreaChunk,
  saveAreaSearch,
} from "@/lib/area-builder.functions";

export const Route = createFileRoute("/admin/area-builder")({
  head: () => ({
    meta: [
      { title: "Area Builder — TapLocal Admin" },
      { name: "description", content: "Find every business on a street and prepare a whole canvassing batch at once." },
      { property: "og:title", content: "Area Builder — TapLocal Admin" },
      { property: "og:description", content: "Bulk street discovery, plaque preparation and QR downloads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AreaBuilderPage,
});

type Place = {
  placeId: string;
  name: string;
  address: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  mapsUri: string | null;
  writeAReviewUri: string | null;
  website: string | null;
  existingBusinessId: string | null;
  existingPlaqueCount: number;
};

type Sort = "street" | "name" | "rating" | "reviews" | "existing" | "category";

function streetNumber(address: string) {
  const match = address.trim().match(/^(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function sortPlaces(places: Place[], sort: Sort) {
  const copy = [...places];
  switch (sort) {
    case "street":
      return copy.sort((a, b) => streetNumber(a.address) - streetNumber(b.address) || a.name.localeCompare(b.name));
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "rating":
      return copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case "reviews":
      return copy.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
    case "existing":
      return copy.sort((a, b) => Number(Boolean(b.existingBusinessId)) - Number(Boolean(a.existingBusinessId)));
    case "category":
      return copy.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? ""));
  }
}

function defaultBatchCode(query: string) {
  const word = query.split(/[\s,]+/)[0] ?? "AREA";
  const now = new Date();
  const month = now.toLocaleString("en-CA", { month: "short" }).toUpperCase();
  return `${word.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${month}-${now.getFullYear()}-A`;
}

const inputClass =
  "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[14px] outline-none focus:border-primary";

function AreaBuilderPage() {
  const navigate = useNavigate();
  const search = useServerFn(discoverArea);
  const create = useServerFn(createAreaBatch);
  const chunk = useServerFn(processAreaChunk);
  const saveSearch = useServerFn(saveAreaSearch);
  const savedFn = useServerFn(listAreaSearches);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("food");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("street");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [mode, setMode] = useState<"prospects" | "plaques">("prospects");
  const [batchCode, setBatchCode] = useState("");
  const [batchName, setBatchName] = useState("");
  const [perPlace, setPerPlace] = useState(1);
  const [designType, setDesignType] = useState<"generic" | "branded">("generic");
  const [progress, setProgress] = useState<{ done: number; total: number; label: string; failed: number } | null>(null);

  const saved = useQuery({ queryKey: ["area-searches"], queryFn: () => savedFn({ data: undefined }) });

  const sorted = useMemo(() => (places ? sortPlaces(places, sort) : []), [places, sort]);
  const selectedPlaces = useMemo(() => sorted.filter((p) => selected.has(p.placeId)), [sorted, selected]);
  const newCount = selectedPlaces.filter((p) => !p.existingBusinessId).length;
  const existingCount = selectedPlaces.length - newCount;

  async function runSearch(nextQuery = query, nextCategory = category) {
    if (nextQuery.trim().length < 3) return;
    setSearching(true);
    setSearchError(null);
    setPlaces(null);
    setSelected(new Set());
    const res = await search({ data: { query: nextQuery.trim(), category: nextCategory as never, maxResults: 120 } });
    setSearching(false);
    if (!res.ok) {
      setSearchError(
        res.error === "not_configured"
          ? "Google business search isn't configured yet."
          : res.error === "rate_limited"
            ? "Too many area searches just now — wait a moment and try again."
            : "That area search didn't return anything. Try adding the city name.",
      );
      return;
    }
    setPlaces(res.places as Place[]);
    setSelected(new Set((res.places as Place[]).map((p) => p.placeId)));
    if (!batchCode) setBatchCode(defaultBatchCode(nextQuery));
    if (!batchName) setBatchName(nextQuery.trim());
  }

  function toggle(placeId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  }

  async function prepare() {
    if (!selectedPlaces.length || !batchCode.trim() || progress) return;
    setProgress({ done: 0, total: selectedPlaces.length, label: "Saving the list…", failed: 0 });

    const res = await create({
      data: {
        batchCode: batchCode.trim().toUpperCase(),
        name: batchName.trim() || batchCode.trim(),
        areaQuery: query.trim(),
        category: category as never,
        designType,
        plaquesPerPlace: perPlace,
        mode,
        places: selectedPlaces.map((p) => ({
          placeId: p.placeId,
          name: p.name,
          address: p.address,
          city: p.city,
          latitude: p.latitude,
          longitude: p.longitude,
          category: p.category,
          rating: p.rating,
          reviewCount: p.reviewCount,
          businessStatus: p.businessStatus,
          mapsUri: p.mapsUri,
          writeAReviewUri: p.writeAReviewUri,
          website: p.website,
        })),
      },
    });

    if (!res.ok || !res.batchId) {
      setProgress(null);
      setSearchError("The batch couldn't be created. Nothing was changed.");
      return;
    }

    // Chunked so a long street never times out, and safe to re-run.
    let done = 0;
    let failed = 0;
    let guard = 0;
    for (;;) {
      guard += 1;
      if (guard > 400) break;
      const step = await chunk({ data: { batchId: res.batchId, limit: 3 } });
      if (!step.ok) break;
      done += step.processed;
      failed = step.failed ? failed + step.failed : failed;
      setProgress({
        done,
        total: done + step.remaining,
        label: mode === "plaques" ? "Creating businesses, plaques and links…" : "Saving prospects…",
        failed,
      });
      if (step.processed === 0 || step.remaining === 0) break;
    }

    await saveSearch({ data: { label: batchName.trim() || query.trim(), areaQuery: query.trim(), category: category as never } });
    void navigate({ to: "/admin/batches/$id", params: { id: res.batchId } });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Build a TapLocal Area</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Find every business on a street, then prepare the whole run at once.
        </p>
      </div>

      <GlassPanel className="space-y-3 p-4">
        <label className="block text-[12px] font-semibold text-muted-foreground">
          Street, neighbourhood, district or area
        </label>
        <input
          className={inputClass}
          placeholder="Wellington Street West, Ottawa"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runSearch();
          }}
        />
        <div className="flex flex-wrap gap-2">
          <select
            className={`${inputClass} sm:w-64`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {AREA_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={searching || query.trim().length < 3}
            className="rounded-xl bg-primary px-5 py-2.5 text-[13px] font-bold text-primary-foreground disabled:opacity-60"
          >
            {searching ? "Searching the area…" : "Search area"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          {["Wellington Street West, Ottawa", "Elgin Street, Ottawa", "Bank Street, Ottawa", "ByWard Market, Ottawa", "Westboro, Ottawa"].map(
            (example) => (
              <button
                key={example}
                type="button"
                className="rounded-lg border border-border px-2 py-1 font-semibold"
                onClick={() => {
                  setQuery(example);
                  void runSearch(example);
                }}
              >
                {example}
              </button>
            ),
          )}
        </div>
        {searchError ? <p className="text-[12px] text-destructive">{searchError}</p> : null}
      </GlassPanel>

      {(saved.data?.searches ?? []).length ? (
        <GlassPanel className="p-4">
          <SectionTitle>Saved areas</SectionTitle>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(saved.data?.searches ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                className="rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-semibold"
                onClick={() => {
                  setQuery(s.areaQuery);
                  setCategory(s.category);
                  void runSearch(s.areaQuery, s.category);
                }}
              >
                {s.label} ↻
              </button>
            ))}
          </div>
        </GlassPanel>
      ) : null}

      {places ? (
        <>
          <GlassPanel className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-display text-[16px] font-bold uppercase tracking-tight">{query}</p>
                <p className="text-[12px] text-muted-foreground">{places.length} businesses found</p>
              </div>
              <div className="flex items-center gap-2">
                <select className="rounded-xl border border-border bg-card px-2 py-2 text-[12px]" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="street">Street order</option>
                  <option value="name">Name</option>
                  <option value="rating">Rating</option>
                  <option value="reviews">Review count</option>
                  <option value="existing">Already in TapLocal</option>
                  <option value="category">Category</option>
                </select>
                <button
                  type="button"
                  className="rounded-xl border border-border px-3 py-2 text-[12px] font-bold"
                  onClick={() => setSelected(new Set(places.map((p) => p.placeId)))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-border px-3 py-2 text-[12px] font-bold"
                  onClick={() => setSelected(new Set())}
                >
                  None
                </button>
              </div>
            </div>
          </GlassPanel>

          <div className="space-y-2">
            {sorted.map((place) => {
              const checked = selected.has(place.placeId);
              return (
                <button
                  key={place.placeId}
                  type="button"
                  onClick={() => toggle(place.placeId)}
                  className="block w-full text-left"
                >
                  <GlassPanel className={`flex items-start gap-3 p-3.5 ${checked ? "border-primary/50" : ""}`}>
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] font-bold ${
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      }`}
                    >
                      {checked ? "✓" : ""}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold">{place.name}</p>
                      <p className="truncate text-[12px] text-muted-foreground">{place.address}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {[place.category, place.rating ? `${place.rating} ★` : null, place.reviewCount ? `${place.reviewCount} reviews` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {place.existingBusinessId ? (
                      <StatusChip tone="brand">
                        In TapLocal · {place.existingPlaqueCount} plaque{place.existingPlaqueCount === 1 ? "" : "s"}
                      </StatusChip>
                    ) : (
                      <StatusChip tone="ok">New</StatusChip>
                    )}
                  </GlassPanel>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {selectedPlaces.length ? (
        <GlassPanel className="space-y-3 p-4">
          <SectionTitle>Prepare {selectedPlaces.length} places</SectionTitle>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("prospects")}
              className={`rounded-xl border p-3 text-left ${mode === "prospects" ? "border-primary bg-primary/10" : "border-border"}`}
            >
              <p className="text-[13px] font-bold">Save prospect list</p>
              <p className="text-[11px] text-muted-foreground">Just the walking route. No plaques created yet.</p>
            </button>
            <button
              type="button"
              onClick={() => setMode("plaques")}
              className={`rounded-xl border p-3 text-left ${mode === "plaques" ? "border-primary bg-primary/10" : "border-border"}`}
            >
              <p className="text-[13px] font-bold">Create plaques for selected</p>
              <p className="text-[11px] text-muted-foreground">Real plaque codes, slugs, NFC + QR links and QR images.</p>
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-[12px] font-semibold text-muted-foreground">Batch name</label>
              <input className={inputClass} value={batchCode} onChange={(e) => setBatchCode(e.target.value)} placeholder="WELLINGTON-SEP-2026-A" />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-muted-foreground">Label</label>
              <input className={inputClass} value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="Wellington Street West" />
            </div>
          </div>

          {mode === "plaques" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="text-[12px] font-semibold text-muted-foreground">Plaques per place</label>
                <select className={inputClass} value={perPlace} onChange={(e) => setPerPlace(Number(e.target.value))}>
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-semibold text-muted-foreground">Design</label>
                <select className={inputClass} value={designType} onChange={(e) => setDesignType(e.target.value as never)}>
                  <option value="generic">Generic — reusable ✓</option>
                  <option value="branded">Business-specific artwork</option>
                </select>
              </div>
            </div>
          ) : null}

          {designType === "branded" ? (
            <p className="rounded-xl border border-border bg-foreground/5 px-3 py-2 text-[12px]">
              Branded artwork is tied to one business — reassignment would need new artwork.
            </p>
          ) : null}

          <div className="rounded-xl border border-border bg-foreground/5 px-3 py-2.5 text-[12px]">
            <p className="font-bold">Before you confirm</p>
            <p className="mt-1 text-muted-foreground">
              {selectedPlaces.length} selected · {newCount} new businesses · {existingCount} already in TapLocal ·{" "}
              {mode === "plaques" ? `${selectedPlaces.length * perPlace} new plaques` : "no plaques yet"} · destination Google Reviews ·
              placement not installed yet
            </p>
          </div>

          {progress ? (
            <div className="rounded-xl border border-border px-3 py-2.5 text-[12px]">
              <p className="font-bold">
                {progress.label} {progress.total ? `${progress.done} / ${progress.total}` : ""}
              </p>
              {progress.failed ? <p className="mt-1 text-destructive">{progress.failed} need attention — you can retry from the batch.</p> : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void prepare()}
            disabled={Boolean(progress) || !batchCode.trim()}
            className="w-full rounded-xl bg-primary px-4 py-3 text-[14px] font-bold text-primary-foreground disabled:opacity-60"
          >
            {progress ? "Preparing…" : `Confirm & prepare ${selectedPlaces.length} places`}
          </button>
        </GlassPanel>
      ) : null}
    </div>
  );
}
