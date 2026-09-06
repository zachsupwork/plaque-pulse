import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, StatusChip } from "@/components/taplocal/Field";
import {
  connectGooglePlace,
  getGoogleConnections,
  refreshGoogleConnection,
  searchGoogleBusinesses,
  setManualReviewUrl,
  type GoogleConnection,
} from "@/lib/google-link.functions";
import { nfcUrl, qrUrl } from "@/lib/smartlink";

/**
 * The Google Business connection for one TapLocal customer.
 *
 * The physical plaque always carries the TapLocal SmartLink; the Google review
 * link below is only the destination behind it, so it can be repaired or
 * changed without ever reprogramming hardware.
 */
export function GoogleBusinessConnection({
  businessId,
  plaqueSlug,
}: {
  businessId: string;
  plaqueSlug?: string | null;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(getGoogleConnections);
  const searchFn = useServerFn(searchGoogleBusinesses);
  const connectFn = useServerFn(connectGooglePlace);
  const refreshFn = useServerFn(refreshGoogleConnection);
  const manualFn = useServerFn(setManualReviewUrl);

  const [searchOpenFor, setSearchOpenFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [ranQuery, setRanQuery] = useState("");
  const [advancedFor, setAdvancedFor] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const connections = useQuery({
    queryKey: ["google-connections", businessId],
    queryFn: () => listFn({ data: { businessId } }),
  });

  const search = useQuery({
    queryKey: ["google-business-search", ranQuery],
    enabled: ranQuery.length >= 3,
    staleTime: 60_000,
    queryFn: () => searchFn({ data: { query: ranQuery } }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["google-connections", businessId] });
    void qc.invalidateQueries({ queryKey: ["admin-business", businessId] });
  };

  const connect = useMutation({
    mutationFn: (vars: { locationId: string | null; placeId: string }) =>
      connectFn({ data: { businessId, locationId: vars.locationId, placeId: vars.placeId } }),
    onSuccess: (res) => {
      setSearchOpenFor(null);
      setQuery("");
      setRanQuery("");
      setNotice(
        res.ok && !res.error
          ? "Google business connected."
          : "Connected, but Google did not return a direct review link. Try Retry below.",
      );
      invalidate();
    },
  });

  const refresh = useMutation({
    mutationFn: (locationId: string) => refreshFn({ data: { locationId } }),
    onSuccess: (res) => {
      setNotice(res.ok && !res.error ? "Refreshed from Google." : "Google could not be reached for this listing.");
      invalidate();
    },
  });

  const manual = useMutation({
    mutationFn: (vars: { locationId: string; url: string }) => manualFn({ data: vars }),
    onSuccess: (res) => {
      if (!res.ok) {
        setNotice("That link is not valid. Use a full https:// address.");
        return;
      }
      setAdvancedFor(null);
      setManualUrl("");
      setNotice(res.warning ?? "Review destination saved.");
      invalidate();
    },
  });

  const rows = connections.data?.ok ? connections.data.connections : [];

  return (
    <div>
      <SectionTitle>Google business connection</SectionTitle>

      {notice ? (
        <p className="mb-2 rounded-xl border border-border bg-secondary/40 px-3.5 py-2.5 text-[12px]">{notice}</p>
      ) : null}

      <GlassPanel className="space-y-4 p-3.5">
        {connections.isLoading ? <p className="text-[13px] text-muted-foreground">Loading…</p> : null}

        {!connections.isLoading && rows.length === 0 ? (
          <div className="space-y-2.5">
            <p className="text-[13px] text-muted-foreground">
              No location on this business yet. Search Google to connect the real listing.
            </p>
            <button
              type="button"
              onClick={() => setSearchOpenFor("new")}
              className="min-h-[44px] w-full rounded-xl bg-primary px-4 text-[13px] font-bold text-primary-foreground"
            >
              Search Google business
            </button>
          </div>
        ) : null}

        {rows.map((c) => (
          <ConnectionCard
            key={c.locationId}
            connection={c}
            plaqueSlug={plaqueSlug ?? null}
            busy={refresh.isPending || connect.isPending}
            onRefresh={() => refresh.mutate(c.locationId)}
            onChange={() => {
              setSearchOpenFor(c.locationId);
              setNotice(null);
            }}
            onNotice={setNotice}
            advancedOpen={advancedFor === c.locationId}
            onToggleAdvanced={() => {
              setAdvancedFor(advancedFor === c.locationId ? null : c.locationId);
              setManualUrl(c.reviewUrl ?? "");
            }}
            manualUrl={manualUrl}
            onManualUrl={setManualUrl}
            onSaveManual={() => manual.mutate({ locationId: c.locationId, url: manualUrl })}
            manualBusy={manual.isPending}
          />
        ))}

        {searchOpenFor ? (
          <div className="space-y-2.5 rounded-2xl border border-border p-3.5">
            <p className="text-[12px] font-semibold">Find the business on Google</p>
            {searchOpenFor !== "new" ? (
              <p className="text-[12px] text-muted-foreground">
                Changing the Google business will update this customer's Google review destination. The plaque's own
                link and QR code stay exactly the same.
              </p>
            ) : null}
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setRanQuery(query.trim());
                }}
                placeholder="Business name and city"
                className="min-h-[44px] flex-1 rounded-xl border border-border bg-background px-3 text-[13px]"
              />
              <button
                type="button"
                onClick={() => setRanQuery(query.trim())}
                className="min-h-[44px] rounded-xl bg-primary px-4 text-[13px] font-bold text-primary-foreground"
              >
                Search
              </button>
            </div>

            {search.isFetching ? <p className="text-[12px] text-muted-foreground">Searching Google…</p> : null}
            {search.data && !search.data.ok ? (
              <p className="text-[12px] text-destructive">Google search is unavailable right now.</p>
            ) : null}

            <div className="space-y-2">
              {(search.data?.ok ? search.data.results : []).map((r) => (
                <button
                  key={r.placeId}
                  type="button"
                  disabled={connect.isPending}
                  onClick={() =>
                    connect.mutate({ locationId: searchOpenFor === "new" ? null : searchOpenFor, placeId: r.placeId })
                  }
                  className="block w-full rounded-xl border border-border p-3 text-left"
                >
                  <p className="text-[13px] font-semibold">{r.name}</p>
                  <p className="text-[12px] text-muted-foreground">{r.address}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {r.rating ? `${r.rating} ★ · ${r.reviewCount ?? 0} reviews` : "No rating yet"}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{r.placeId}</p>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSearchOpenFor(null)}
              className="min-h-[44px] w-full rounded-xl border border-border text-[13px] font-semibold"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </GlassPanel>
    </div>
  );
}

function copy(text: string, onNotice: (m: string) => void, label: string) {
  void navigator.clipboard?.writeText(text).then(
    () => onNotice(`${label} copied.`),
    () => onNotice("Could not copy — select the text instead."),
  );
}

function ConnectionCard({
  connection: c,
  plaqueSlug,
  busy,
  onRefresh,
  onChange,
  onNotice,
  advancedOpen,
  onToggleAdvanced,
  manualUrl,
  onManualUrl,
  onSaveManual,
  manualBusy,
}: {
  connection: GoogleConnection;
  plaqueSlug: string | null;
  busy: boolean;
  onRefresh: () => void;
  onChange: () => void;
  onNotice: (m: string) => void;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  manualUrl: string;
  onManualUrl: (v: string) => void;
  onSaveManual: () => void;
  manualBusy: boolean;
}) {
  const linked = Boolean(c.reviewUrl);

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{c.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">{[c.address, c.city].filter(Boolean).join(", ")}</p>
        </div>
        <StatusChip tone={linked ? "ok" : c.placeId ? "warn" : "idle"}>
          {linked ? "Review link connected" : c.placeId ? "No review link" : "Not linked"}
        </StatusChip>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-[12px]">
        <Cell label="Google rating" value={c.rating ? `${c.rating} ★` : "—"} />
        <Cell label="Reviews" value={c.reviewCount != null ? String(c.reviewCount) : "—"} />
        <Cell label="Status" value={c.businessStatus ?? "—"} />
        <Cell label="Last checked" value={c.reviewUrlCheckedAt ? new Date(c.reviewUrlCheckedAt).toLocaleString() : "—"} />
      </dl>

      {c.placeId ? (
        <p className="break-all font-mono text-[10px] text-muted-foreground">Place ID: {c.placeId}</p>
      ) : null}

      {plaqueSlug ? (
        <div className="space-y-1 rounded-xl bg-secondary/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">TapLocal public link</p>
          <p className="break-all text-[12px]">{nfcUrl(plaqueSlug)}</p>
          <p className="text-[11px] text-muted-foreground">
            This is what is programmed onto the NFC chip and the QR code — never the Google address.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <SmallButton onClick={() => copy(nfcUrl(plaqueSlug), onNotice, "NFC link")}>Copy NFC link</SmallButton>
            <SmallLink href={qrUrl(plaqueSlug)}>Test QR destination</SmallLink>
          </div>
        </div>
      ) : null}

      <div className="space-y-1 rounded-xl bg-secondary/40 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Google destination</p>
        {linked ? (
          <>
            <p className="break-all text-[12px]">{c.reviewUrl}</p>
            <p className="text-[11px] text-muted-foreground">
              {c.reviewUrlSource === "manual" ? "Entered by an admin" : "Provided by Google"}
            </p>
          </>
        ) : (
          <p className="text-[12px] text-destructive">
            Direct Google review link could not be retrieved. Nothing has been guessed or substituted.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {linked ? (
          <>
            <SmallButton onClick={() => copy(c.reviewUrl!, onNotice, "Review link")}>Copy review link</SmallButton>
            <SmallLink href={c.reviewUrl!}>Open / test review link</SmallLink>
          </>
        ) : null}
        <SmallButton onClick={onRefresh} disabled={busy || !c.placeId}>
          {linked ? "Refresh from Google" : "Retry"}
        </SmallButton>
        <SmallButton onClick={onChange}>{c.placeId ? "Change Google business" : "Search Google business"}</SmallButton>
        {c.mapsUri ? <SmallLink href={c.mapsUri}>Google Maps listing</SmallLink> : null}
        <SmallButton onClick={onToggleAdvanced}>Edit Google review destination</SmallButton>
      </div>

      {advancedOpen ? (
        <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <p className="text-[11px] text-muted-foreground">
            Advanced. Customers never see this. Paste a full https:// address.
          </p>
          <input
            value={manualUrl}
            onChange={(e) => onManualUrl(e.target.value)}
            placeholder="https://…"
            className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-[12px]"
          />
          <div className="flex flex-wrap gap-2">
            <SmallButton onClick={onSaveManual} disabled={manualBusy}>
              Save destination
            </SmallButton>
            <SmallButton onClick={onRefresh} disabled={busy || !c.placeId}>
              Restore Google link
            </SmallButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-[13px] font-semibold">{value}</dd>
    </div>
  );
}

function SmallButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-[40px] rounded-xl border border-border px-3 text-[12px] font-semibold disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SmallLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-[40px] items-center rounded-xl border border-border px-3 text-[12px] font-semibold"
    >
      {children}
    </a>
  );
}
