import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, StatusChip } from "@/components/taplocal/Field";
import { listAllBusinesses } from "@/lib/admin-data.functions";
import {
  adminCreateBusinessFromPlace,
  adminGooglePlaceDetails,
  adminSearchGoogle,
} from "@/lib/admin-discovery.functions";
import { backfillReviewLinks, googleLinkMaintenance } from "@/lib/google-link.functions";

export const Route = createFileRoute("/admin/businesses/")({
  head: () => ({
    meta: [
      { title: "Business directory — TapLocal admin" },
      { name: "description", content: "Search TapLocal businesses or find a real business on Google." },
      { property: "og:title", content: "Business directory — TapLocal admin" },
      { property: "og:description", content: "Search TapLocal businesses or find a real business on Google." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BusinessDirectory,
});

const FILTERS = [
  ["all", "All"],
  ["active", "Active"],
  ["unclaimed", "Configured, unclaimed"],
  ["no_owner", "No owner"],
  ["has_plaques", "Has plaques"],
  ["no_plaques", "No plaques"],
  ["recent", "Recent"],
] as const;

function newSessionToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

function BusinessDirectory() {
  const listFn = useServerFn(listAllBusinesses);
  const googleFn = useServerFn(adminSearchGoogle);
  const detailsFn = useServerFn(adminGooglePlaceDetails);
  const createFn = useServerFn(adminCreateBusinessFromPlace);
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [sessionToken, setSessionToken] = useState(newSessionToken);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const list = useQuery({
    queryKey: ["admin-businesses", debounced, filter],
    queryFn: () => listFn({ data: { query: debounced, filter } }),
  });

  const googleEnabled = debounced.length >= 3;
  const google = useQuery({
    queryKey: ["admin-google-search", debounced],
    enabled: googleEnabled,
    staleTime: 60_000,
    queryFn: () => googleFn({ data: { query: debounced, sessionToken } }),
  });

  const details = useQuery({
    queryKey: ["admin-google-place", selectedPlaceId],
    enabled: Boolean(selectedPlaceId),
    queryFn: () => detailsFn({ data: { placeId: selectedPlaceId!, sessionToken } }),
  });

  const rows = list.data?.ok ? list.data.businesses : [];
  const googleResults = google.data?.ok ? google.data.results : [];
  const googleError = google.data && !google.data.ok ? google.data.error : google.isError ? "failed" : null;

  const googleMessage = useMemo(() => {
    if (!googleEnabled) return null;
    if (google.isLoading) return "Searching Google…";
    switch (googleError) {
      case "not_configured":
        return "Google business search isn't configured yet. Existing TapLocal business search still works.";
      case "rate_limited":
        return "Too many searches. Try again in a moment.";
      case "unauthorized":
      case "forbidden":
        return "You don't have access to Google business search.";
      case "failed":
        return "Couldn't search Google right now.";
      default:
        return googleResults.length === 0 ? "No businesses found." : null;
    }
  }, [googleEnabled, google.isLoading, googleError, googleResults.length]);

  function clearSearch() {
    setQuery("");
    setDebounced("");
    setSelectedPlaceId(null);
    setAddError(null);
    setSessionToken(newSessionToken());
  }

  async function addToTapLocal(placeId: string) {
    setAdding(true);
    setAddError(null);
    const res = await createFn({ data: { placeId, sessionToken } });
    setAdding(false);
    setSessionToken(newSessionToken());
    if (res.ok && res.businessId) {
      navigate({ to: "/admin/setup", search: { businessId: res.businessId } });
      return;
    }
    setAddError(
      res.error === "not_configured"
        ? "Google business search isn't configured yet."
        : "Couldn't add that business right now.",
    );
  }

  const place = details.data?.ok ? details.data.place : null;
  const placeExistingId = details.data?.ok ? details.data.existingBusinessId : null;

  return (
    <div className="space-y-4 pb-24">
      <div>
        <h1 className="font-display text-[24px] font-bold tracking-tight">Businesses</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Search TapLocal, or find a real business on Google and add it.
        </p>
      </div>

      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search TapLocal or find a business on Google"
          className="w-full rounded-xl border border-border bg-card px-3.5 py-3 pr-10 text-[14px] outline-none focus:border-primary/60"
        />
        {query ? (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-[15px] text-muted-foreground"
          >
            ×
          </button>
        ) : null}
      </div>
      {(list.isFetching || google.isFetching) && query ? (
        <p className="text-[12px] text-muted-foreground">Searching…</p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
              filter === value ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        <SectionTitle>Your TapLocal businesses</SectionTitle>
        {list.isLoading ? <p className="text-[13px] text-muted-foreground">Loading…</p> : null}
        {!list.isLoading && rows.length === 0 ? (
          <GlassPanel className="p-4">
            <p className="text-[13px] text-muted-foreground">
              {debounced ? "No existing TapLocal businesses found." : "No TapLocal businesses yet."}
            </p>
            {!debounced ? (
              <p className="mt-1 text-[12px] text-muted-foreground">Search above to add your first business.</p>
            ) : null}
          </GlassPanel>
        ) : null}

        <div className="mt-2.5 space-y-2.5">
          {rows.map((b) => (
            <Link key={b.id} to="/admin/businesses/$id" params={{ id: b.id }} className="block">
              <GlassPanel className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-[16px] font-bold tracking-tight">{b.name}</p>
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                      {[b.industry, b.location?.name, b.location?.city].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {b.memberCount === 0 ? <StatusChip tone="attention">Admin managed</StatusChip> : null}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-5">
                  <Cell label="Google rating" value={b.location?.rating ? `${b.location.rating} ★` : "—"} />
                  <Cell label="Google reviews" value={b.location?.reviews != null ? String(b.location.reviews) : "—"} />
                  <Cell
                    label="Google connection"
                    value={
                      b.location?.reviewUrl ? "Review link connected" : b.location?.placeId ? "Needs review link" : "Not linked"
                    }
                  />
                  <Cell label="Plaque status" value={`${b.activePlaques} active / ${b.plaques}`} />
                  <Cell label="Last activity" value={new Date(b.lastActivity).toLocaleDateString()} />
                </div>
              </GlassPanel>
            </Link>
          ))}
        </div>
      </div>

      <GoogleLinkMaintenance />

      <div>
        <SectionTitle>Find on Google</SectionTitle>
        {!googleEnabled ? (
          <p className="text-[12px] text-muted-foreground">Type at least 3 letters to search real businesses.</p>
        ) : null}
        {googleMessage ? <p className="text-[13px] text-muted-foreground">{googleMessage}</p> : null}

        <div className="mt-2.5 space-y-2.5">
          {googleEnabled &&
            googleResults.map((r) => (
              <GlassPanel key={r.placeId} className="p-4">
                <p className="font-display text-[16px] font-bold tracking-tight">{r.name}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{r.address}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {r.category ? <StatusChip tone="idle">{r.category}</StatusChip> : null}
                  <StatusChip tone="idle">Public Google data</StatusChip>
                  {r.existingBusinessId ? <StatusChip tone="ok">Already in TapLocal</StatusChip> : null}
                </div>

                {r.existingBusinessId ? (
                  <Link
                    to="/admin/businesses/$id"
                    params={{ id: r.existingBusinessId }}
                    className="mt-3 block rounded-xl border border-border px-4 py-3 text-center text-[13px] font-semibold"
                  >
                    Open business
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAddError(null);
                      setSelectedPlaceId(r.placeId === selectedPlaceId ? null : r.placeId);
                    }}
                    className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-[13px] font-semibold text-primary-foreground"
                  >
                    {selectedPlaceId === r.placeId ? "Hide details" : "Add / set up"}
                  </button>
                )}

                {selectedPlaceId === r.placeId ? (
                  <div className="mt-3 rounded-xl border border-border p-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Public Google data
                    </p>
                    {details.isLoading ? (
                      <p className="mt-2 text-[13px] text-muted-foreground">Loading listing…</p>
                    ) : null}
                    {details.data && !details.data.ok ? (
                      <p className="mt-2 text-[13px] text-muted-foreground">Couldn't load that listing right now.</p>
                    ) : null}
                    {place ? (
                      <div className="mt-2 space-y-1 text-[13px]">
                        <p className="font-semibold">{place.name}</p>
                        <p className="text-muted-foreground">{place.formattedAddress}</p>
                        {place.primaryType ? <p className="text-muted-foreground">{place.primaryType}</p> : null}
                        {place.rating ? (
                          <p className="text-muted-foreground">
                            {place.rating} ★ · {place.reviewCount ?? 0} reviews
                          </p>
                        ) : null}
                        {place.phone ? <p className="text-muted-foreground">{place.phone}</p> : null}
                        {place.website ? <p className="truncate text-muted-foreground">{place.website}</p> : null}
                        {place.mapsUri ? (
                          <a
                            href={place.mapsUri}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-primary underline"
                          >
                            Google Maps listing
                          </a>
                        ) : null}
                      </div>
                    ) : null}

                    {addError ? <p className="mt-2 text-[12px] text-destructive">{addError}</p> : null}

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPlaceId(null)}
                        className="flex-1 rounded-xl border border-border px-4 py-3 text-[13px] font-semibold"
                      >
                        Cancel
                      </button>
                      {placeExistingId ? (
                        <Link
                          to="/admin/businesses/$id"
                          params={{ id: placeExistingId }}
                          className="flex-1 rounded-xl bg-primary px-4 py-3 text-center text-[13px] font-semibold text-primary-foreground"
                        >
                          Open business
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled={adding || !place}
                          onClick={() => addToTapLocal(r.placeId)}
                          className="flex-1 rounded-xl bg-primary px-4 py-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
                        >
                          {adding ? "Adding…" : "Add to TapLocal"}
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </GlassPanel>
            ))}
        </div>
      </div>
    </div>
  );
}

/** Bulk repair: fetch the direct review link for every listing that is missing one. */
function GoogleLinkMaintenance() {
  const qc = useQueryClient();
  const statusFn = useServerFn(googleLinkMaintenance);
  const backfillFn = useServerFn(backfillReviewLinks);
  const [message, setMessage] = useState<string | null>(null);

  const status = useQuery({ queryKey: ["google-link-maintenance"], queryFn: () => statusFn({ data: undefined }) });
  const run = useMutation({
    mutationFn: () => backfillFn({ data: { limit: 20 } }),
    onSuccess: (res) => {
      setMessage(
        res.ok
          ? `${res.fixed} review link${res.fixed === 1 ? "" : "s"} fetched${res.failed ? `, ${res.failed} still missing` : ""}.`
          : "Google could not be reached right now.",
      );
      void qc.invalidateQueries({ queryKey: ["google-link-maintenance"] });
      void qc.invalidateQueries({ queryKey: ["admin-businesses"] });
    },
  });

  const missing = status.data?.ok ? status.data.missing.length : 0;
  const linked = status.data?.ok ? status.data.linked : 0;

  return (
    <div>
      <SectionTitle>Google link maintenance</SectionTitle>
      <GlassPanel className="space-y-2.5 p-3.5">
        <p className="text-[13px]">
          {linked} listing{linked === 1 ? "" : "s"} with a direct review link
          {missing ? ` · ${missing} still missing` : " · all connected"}
        </p>
        {message ? <p className="text-[12px] text-muted-foreground">{message}</p> : null}
        <button
          type="button"
          disabled={run.isPending || missing === 0}
          onClick={() => run.mutate()}
          className="min-h-[44px] w-full rounded-xl border border-border text-[13px] font-semibold disabled:opacity-50"
        >
          {run.isPending ? "Fetching from Google…" : "Fetch missing review links"}
        </button>
      </GlassPanel>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
