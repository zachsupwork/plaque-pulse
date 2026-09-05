import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllBusinesses } from "@/lib/admin-data.functions";
import { adminSearchGoogle } from "@/lib/admin-discovery.functions";

/**
 * One search box that finds a business we already hold and a real business on
 * Google, with results directly under the input so the keyboard stays open.
 */
export function BusinessSearch({
  onPickExisting,
  onPickPlace,
  busy,
}: {
  onPickExisting: (businessId: string, name: string) => void;
  onPickPlace: (placeId: string, name: string) => void;
  busy?: boolean;
}) {
  const listFn = useServerFn(listAllBusinesses);
  const googleFn = useServerFn(adminSearchGoogle);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sessionToken] = useState(() => crypto.randomUUID().replace(/-/g, ""));

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const mine = useQuery({
    queryKey: ["workbench-mine", debounced],
    enabled: debounced.length >= 2,
    queryFn: () => listFn({ data: { query: debounced, filter: "all" } }),
  });

  const google = useQuery({
    queryKey: ["workbench-google", debounced],
    enabled: debounced.length >= 3,
    staleTime: 60_000,
    queryFn: () => googleFn({ data: { query: debounced, sessionToken } }),
  });

  const mineRows = (mine.data?.ok ? mine.data.businesses : []).slice(0, 4);
  const googleRows = (google.data?.ok ? google.data.results : []).slice(0, 6);
  const searching = mine.isFetching || google.isFetching;
  const open = debounced.length >= 2;

  return (
    <div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search business name"
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-card px-3.5 py-3.5 pr-10 text-[15px] outline-none focus:border-primary/60"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full px-2.5 py-1 text-[16px] text-muted-foreground"
          >
            ×
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
          {searching && mineRows.length === 0 && googleRows.length === 0 ? (
            <p className="px-3.5 py-3 text-[13px] text-muted-foreground">Searching…</p>
          ) : null}

          {mineRows.length ? (
            <>
              <p className="bg-foreground/5 px-3.5 py-1.5 text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                TapLocal
              </p>
              {mineRows.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onPickExisting(b.id, b.name)}
                  className="flex w-full items-center justify-between gap-3 border-b border-border px-3.5 py-3 text-left last:border-0 disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-bold">{b.name}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {[b.location?.name, b.location?.city].filter(Boolean).join(" · ") || "Already added"}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground">
                    Select
                  </span>
                </button>
              ))}
            </>
          ) : null}

          {googleRows.length ? (
            <>
              <p className="bg-foreground/5 px-3.5 py-1.5 text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                Google
              </p>
              {googleRows.map((r) => (
                <button
                  key={r.placeId}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    r.existingBusinessId
                      ? onPickExisting(r.existingBusinessId, r.name)
                      : onPickPlace(r.placeId, r.name)
                  }
                  className="flex w-full items-center justify-between gap-3 border-b border-border px-3.5 py-3 text-left last:border-0 disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-bold">{r.name}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{r.address}</span>
                    {r.existingBusinessId ? (
                      <span className="block text-[11px] font-semibold text-accent">Already added</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground">
                    Select
                  </span>
                </button>
              ))}
            </>
          ) : null}

          {!searching && mineRows.length === 0 && googleRows.length === 0 ? (
            <p className="px-3.5 py-3 text-[13px] text-muted-foreground">
              {debounced.length < 3 ? "Keep typing…" : "No businesses found."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
