import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StatusChip } from "@/components/taplocal/Field";
import {
  InstagramDestinationHelper,
  useInstagramDiscovery,
} from "@/components/taplocal/InstagramDiscovery";
import {
  discoverPlaqueLink,
  plaqueLinkContext,
  savePlaqueLink,
  type LinkCandidate,
  type LinkKind,
} from "@/lib/link-discovery.functions";
import { DESTINATIONS, buildDestinationUrl, destinationOption, type DestinationKind } from "@/lib/destinations";

/**
 * The intelligent "Change destination" body.
 *
 * Everything is researched from the plaque's CURRENT business, location and
 * Google Place ID. Nothing here ever rewrites the physical tag — only the
 * server-side destination behind the permanent SmartLink changes.
 */

const DISCOVERABLE: LinkKind[] = ["website", "menu", "booking", "facebook", "tiktok"];

function isDiscoverable(kind: DestinationKind): kind is LinkKind {
  return (DISCOVERABLE as string[]).includes(kind);
}

function pretty(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

function prettyPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

const WORKING: Record<LinkKind, string> = {
  website: "Finding official website…",
  menu: "Checking official menu links…",
  booking: "Looking for a booking link…",
  facebook: "Checking official links…",
  tiktok: "Checking official links…",
};

export function SmartDestinationPicker({
  plaqueId,
  kind,
  setKind,
  value,
  setValue,
}: {
  plaqueId: string;
  kind: DestinationKind;
  setKind: (k: DestinationKind) => void;
  value: string;
  setValue: (v: string) => void;
}) {
  const qc = useQueryClient();
  const contextFn = useServerFn(plaqueLinkContext);
  const discoverFn = useServerFn(discoverPlaqueLink);
  const saveFn = useServerFn(savePlaqueLink);
  const [deep, setDeep] = useState<Partial<Record<LinkKind, boolean>>>({});
  const [manual, setManual] = useState(false);

  const ctxQuery = useQuery({
    queryKey: ["plaque-link-context", plaqueId],
    queryFn: () => contextFn({ data: { plaqueId } }),
    staleTime: 60_000,
  });
  const ctx = ctxQuery.data?.ok ? ctxQuery.data.context : null;

  // Cheap background discovery for the two links an operator reaches for most.
  const prefetch: LinkKind[] = ["website", "menu"];

  const linkQuery = useQuery({
    queryKey: ["plaque-link", plaqueId, kind, deep[kind as LinkKind] ? "deep" : "quick"],
    enabled: Boolean(ctx) && isDiscoverable(kind),
    staleTime: 5 * 60_000,
    queryFn: () =>
      discoverFn({
        data: { plaqueId, kind: kind as LinkKind, deep: Boolean(deep[kind as LinkKind]) },
      }),
  });

  useQuery({
    queryKey: ["plaque-link", plaqueId, "website", "quick"],
    enabled: Boolean(ctx) && !prefetch.includes(kind as LinkKind),
    staleTime: 5 * 60_000,
    queryFn: () => discoverFn({ data: { plaqueId, kind: "website" } }),
  });

  const instagram = useInstagramDiscovery(ctx?.businessId ?? null);

  const saved = useMemo(
    () => (ctx?.saved ?? []).find((s) => s.kind === (kind as LinkKind)) ?? null,
    [ctx, kind],
  );

  const result = linkQuery.data?.ok ? linkQuery.data.result : null;
  const candidates: LinkCandidate[] = saved
    ? [{ url: saved.url, label: saved.label, source: saved.source, confidence: saved.confidence }, ...(result?.candidates ?? []).filter((c) => c.url !== saved.url)]
    : (result?.candidates ?? []);
  const best = candidates[0] ?? null;

  // Auto-fill from a confident answer, but never overwrite typing.
  useEffect(() => {
    if (manual || value.trim()) return;
    if (kind === "call" && ctx?.phone) setValue(ctx.phone);
    else if (isDiscoverable(kind) && best && best.confidence >= 80) setValue(best.url);
  }, [kind, best, ctx?.phone, manual, value, setValue]);

  // Switching destination type resets the field to the new type's answer.
  useEffect(() => {
    setManual(false);
    setValue("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const confirmLink = useMutation({
    mutationFn: (c: LinkCandidate) =>
      saveFn({ data: { plaqueId, kind: kind as LinkKind, url: c.url, label: c.label } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["plaque-link-context", plaqueId] }),
  });

  const option = destinationOption(kind);
  const derived = kind === "google_review" || kind === "directions";
  const previewUrl = derived ? null : buildDestinationUrl(kind, value);

  return (
    <div className="space-y-3">
      {ctx ? (
        <div className="rounded-xl border border-border bg-card/70 p-3">
          <p className="font-display text-[14px] font-bold tracking-tight">{ctx.businessName}</p>
          <p className="text-[12px] text-muted-foreground">{ctx.address ?? ctx.city ?? "No address on file"}</p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
            <LinkRow label="Google Reviews" ok={Boolean(ctx.reviewUrl || ctx.placeId)} detail={ctx.reviewUrl ? "Ready" : ctx.placeId ? "Ready" : "No listing"} />
            <LinkRow label="Directions" ok={Boolean(ctx.mapsUri || ctx.placeId)} detail={ctx.mapsUri || ctx.placeId ? "Ready" : "No listing"} />
            <LinkRow label="Phone" ok={Boolean(ctx.phone)} detail={ctx.phone ? prettyPhone(ctx.phone) : "Not on the listing"} />
            <LinkRow
              label="Website"
              ok={Boolean(ctx.website)}
              detail={ctx.website ? pretty(ctx.website) : linkQuery.isFetching ? "Searching…" : "Not found yet"}
            />
            <LinkRow
              label="Instagram"
              ok={Boolean(instagram.best)}
              detail={instagram.loading ? "Searching…" : instagram.best ? `@${instagram.best.username}` : "Not found yet"}
            />
          </div>
        </div>
      ) : ctxQuery.isLoading ? (
        <p className="text-[12px] text-muted-foreground">Loading business links…</p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {DESTINATIONS.map((d) => (
          <button
            key={d.kind}
            type="button"
            onClick={() => setKind(d.kind)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
              kind === d.kind ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* ---- what we found for the chosen type ---- */}
      {derived ? (
        <p className="text-[12px] text-muted-foreground">
          {kind === "google_review"
            ? ctx?.reviewUrl
              ? "Google's own write-a-review link is on file — nothing to type."
              : "TapLocal builds this from the business's Google listing — nothing to type."
            : "Built from the business's Google Maps listing — nothing to type."}
        </p>
      ) : kind === "instagram" && ctx ? (
        <InstagramDestinationHelper
          businessId={ctx.businessId}
          discovery={instagram}
          value={value}
          onUse={(url) => {
            setManual(false);
            setValue(url);
          }}
          onManual={() => setManual(true)}
        />
      ) : kind === "call" ? (
        ctx?.phone ? (
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-3">
            <StatusChip tone="ok">Phone number on file ✓</StatusChip>
            <p className="mt-1.5 font-display text-[17px] font-bold tracking-tight">{prettyPhone(ctx.phone)}</p>
            <p className="text-[12px] text-muted-foreground">Source: Google business listing</p>
            <button
              type="button"
              onClick={() => setValue(ctx.phone!)}
              className="mt-2 rounded-xl bg-primary px-3.5 py-2 text-[12px] font-bold text-primary-foreground"
            >
              Use this number
            </button>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">No public phone number on file — type one below.</p>
        )
      ) : isDiscoverable(kind) ? (
        <DiscoveryBlock
          kind={kind}
          loading={linkQuery.isFetching}
          status={saved ? "found" : (result?.status ?? "not_found")}
          candidates={candidates}
          onUse={(c) => {
            setManual(false);
            setValue(c.url);
            confirmLink.mutate(c);
          }}
          onDeeper={() => setDeep((d) => ({ ...d, [kind]: true }))}
          canGoDeeper={kind === "website" && !deep["website"]}
          onManual={() => setManual(true)}
        />
      ) : null}

      {/* ---- always available manual entry ---- */}
      {option.input !== "none" ? (
        <div>
          <input
            value={value}
            onChange={(e) => {
              setManual(true);
              setValue(e.target.value);
            }}
            placeholder={option.placeholder ?? ""}
            className="w-full rounded-xl border border-border bg-card px-3 py-3 text-[14px] outline-none focus:border-primary/60"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">You can always paste your own link here.</p>
        </div>
      ) : null}

      {previewUrl ? (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
          <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">New destination</p>
          <p className="mt-0.5 text-[13px] font-bold">{option.label}</p>
          <p className="truncate text-[12px] text-muted-foreground">{previewUrl}</p>
          {previewUrl.startsWith("http") ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block rounded-xl border border-border px-3.5 py-2 text-[12px] font-semibold"
            >
              Open to verify
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LinkRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <p className="truncate">
      <span className={ok ? "text-accent" : "text-muted-foreground"}>{ok ? "✓" : "○"}</span>{" "}
      <span className="font-semibold">{label}</span>{" "}
      <span className="text-muted-foreground">{detail}</span>
    </p>
  );
}

function DiscoveryBlock({
  kind,
  loading,
  status,
  candidates,
  onUse,
  onDeeper,
  canGoDeeper,
  onManual,
}: {
  kind: LinkKind;
  loading: boolean;
  status: "found" | "possible" | "not_found";
  candidates: LinkCandidate[];
  onUse: (c: LinkCandidate) => void;
  onDeeper: () => void;
  canGoDeeper: boolean;
  onManual: () => void;
}) {
  if (loading) {
    return <p className="text-[12px] text-muted-foreground">{WORKING[kind]}</p>;
  }
  if (!candidates.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-[13px] font-semibold">Nothing found yet</p>
        <p className="text-[12px] text-muted-foreground">
          TapLocal checked the Google listing and the business's own website.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {canGoDeeper ? (
            <button
              type="button"
              onClick={onDeeper}
              className="rounded-xl bg-primary px-3.5 py-2 text-[12px] font-bold text-primary-foreground"
            >
              Search deeper
            </button>
          ) : null}
          <button type="button" onClick={onManual} className="rounded-xl border border-border px-3.5 py-2 text-[12px] font-semibold">
            Enter manually
          </button>
        </div>
      </div>
    );
  }

  const best = candidates[0]!;
  const others = candidates.slice(1, 4);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-accent/40 bg-accent/5 p-3">
        <StatusChip tone={status === "found" ? "ok" : "attention"}>
          {status === "found" ? "Found ✓" : "Possible match"}
        </StatusChip>
        <p className="mt-1.5 truncate font-display text-[15px] font-bold tracking-tight">{best.label}</p>
        <a href={best.url} target="_blank" rel="noreferrer" className="block truncate text-[12px] text-primary underline">
          {best.url}
        </a>
        <p className="mt-1 text-[12px] text-muted-foreground">Source: {best.source}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onUse(best)}
            className="rounded-xl bg-primary px-3.5 py-2 text-[12px] font-bold text-primary-foreground"
          >
            Use this link
          </button>
          {canGoDeeper ? (
            <button type="button" onClick={onDeeper} className="rounded-xl border border-border px-3.5 py-2 text-[12px] font-semibold">
              Search deeper
            </button>
          ) : null}
          <button type="button" onClick={onManual} className="rounded-xl border border-border px-3.5 py-2 text-[12px] font-semibold">
            Enter manually
          </button>
        </div>
      </div>

      {others.length ? (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[12px] font-bold">Other options</p>
          {others.map((c) => (
            <div key={c.url} className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{c.label}</p>
                <p className="truncate text-[11px] text-muted-foreground">{c.source}</p>
              </div>
              <button
                type="button"
                onClick={() => onUse(c)}
                className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground"
              >
                Use
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
