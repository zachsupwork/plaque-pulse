import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, StatusChip } from "@/components/taplocal/Field";
import { confirmInstagram, discoverInstagram, rejectInstagram } from "@/lib/social-discovery.functions";

/**
 * Public Instagram discovery for one business.
 *
 * "Public Instagram found" only ever means we found a public profile — it is
 * never presented as an owner-connected account.
 */

export type InstagramFinding = {
  username: string;
  profileUrl: string;
  confidence: number;
  scope: "location" | "brand";
  evidence: Array<{ label: string; weight: number; source: string }>;
};

const PROGRESS = [
  "Finding official website…",
  "Checking social links…",
  "Searching Instagram…",
  "Cross-checking location…",
];

function confidenceWord(confidence: number) {
  if (confidence >= 95) return "Very high";
  if (confidence >= 80) return "High";
  if (confidence >= 65) return "Likely";
  return "Uncertain";
}

/** Runs discovery for a business and reports the best account upward. */
export function useInstagramDiscovery(businessId: string | null) {
  const discoverFn = useServerFn(discoverInstagram);
  const [deepRun, setDeepRun] = useState(0);

  const query = useQuery({
    queryKey: ["instagram-discovery", businessId, deepRun],
    enabled: Boolean(businessId),
    staleTime: 5 * 60_000,
    queryFn: () =>
      discoverFn({ data: { businessId: businessId!, deep: deepRun > 0, force: deepRun > 0 } }),
  });

  const result = query.data?.ok ? query.data.result : null;

  return {
    loading: query.isFetching,
    result,
    best: (result?.bestCandidate ?? null) as InstagramFinding | null,
    candidates: (result?.candidates ?? []) as InstagramFinding[],
    status: result?.status ?? (query.isFetching ? "searching" : "not_found"),
    searchDeeper: () => setDeepRun((n) => n + 1),
    refetch: () => void query.refetch(),
  };
}

export function DiscoveryProgress() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % PROGRESS.length), 1400);
    return () => clearInterval(t);
  }, []);
  return <span className="text-[12px] text-muted-foreground">{PROGRESS[step]}</span>;
}

/** Compact "Business links" row used during setup. */
export function BusinessLinksPanel({
  businessId,
  website,
  googleConnected,
  discovery,
}: {
  businessId: string;
  website: string | null;
  googleConnected: boolean;
  discovery: ReturnType<typeof useInstagramDiscovery>;
}) {
  const label =
    discovery.loading
      ? null
      : discovery.status === "verified"
        ? `Instagram verified ✓ @${discovery.best?.username}`
        : discovery.status === "found"
          ? `Public Instagram found ✓ @${discovery.best?.username}`
          : discovery.status === "candidates"
            ? "Possible match — review"
            : "Not found";

  return (
    <GlassPanel className="p-4">
      <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">Business links</p>
      <div className="mt-2 space-y-1.5 text-[13px]">
        <p className={googleConnected ? "text-accent" : "text-muted-foreground"}>
          {googleConnected ? "✓" : "○"} Google — {googleConnected ? "public listing found" : "not linked yet"}
        </p>
        <p className={website ? "text-accent" : "text-muted-foreground"}>
          {website ? "✓" : "○"} Website — {website ? website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "none on the listing"}
        </p>
        <p className="flex items-center gap-2">
          <span className={discovery.best ? "text-accent" : "text-muted-foreground"}>
            {discovery.best ? "✓" : "○"} Instagram —
          </span>
          {discovery.loading ? <DiscoveryProgress /> : <span className="text-[13px]">{label}</span>}
        </p>
      </div>
      {!discovery.loading && discovery.status === "not_found" ? (
        <button
          type="button"
          onClick={discovery.searchDeeper}
          className="mt-2.5 rounded-xl border border-border px-3 py-2 text-[12px] font-semibold"
        >
          Search deeper
        </button>
      ) : null}
      <input type="hidden" value={businessId} readOnly />
    </GlassPanel>
  );
}

/** The Instagram destination helper shown once Instagram is chosen. */
export function InstagramDestinationHelper({
  businessId,
  discovery,
  value,
  onUse,
  onManual,
}: {
  businessId: string;
  discovery: ReturnType<typeof useInstagramDiscovery>;
  value: string;
  onUse: (profileUrl: string) => void;
  onManual: () => void;
}) {
  const qc = useQueryClient();
  const confirmFn = useServerFn(confirmInstagram);
  const rejectFn = useServerFn(rejectInstagram);
  const [manual, setManual] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["instagram-discovery", businessId] });
    void qc.invalidateQueries({ queryKey: ["social-profiles", businessId] });
  };

  const confirm = useMutation({
    mutationFn: (vars: { value: string; scope: "location" | "brand" }) =>
      confirmFn({ data: { businessId, value: vars.value, scope: vars.scope } }),
    onSuccess: (res) => {
      if (res.ok && res.profile) onUse(res.profile.profileUrl);
      invalidate();
    },
  });

  const reject = useMutation({
    mutationFn: (username: string) => rejectFn({ data: { businessId, username } }),
    onSuccess: () => {
      invalidate();
      discovery.searchDeeper();
    },
  });

  const used = useMemo(() => value.trim().length > 0, [value]);

  if (discovery.loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-3.5">
        <p className="text-[13px] font-bold">Finding Instagram…</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Checking the business's website and public search results.
        </p>
        <button
          type="button"
          onClick={() => {
            setManual(true);
            onManual();
          }}
          className="mt-2.5 rounded-xl border border-border px-3 py-2 text-[12px] font-semibold"
        >
          Enter manually
        </button>
      </div>
    );
  }

  const best = discovery.best;
  const others = discovery.candidates.filter((c) => c.username !== best?.username).slice(0, 3);

  if (!best) {
    return (
      <div className="rounded-xl border border-border bg-card p-3.5">
        <p className="text-[13px] font-bold">Instagram not found yet</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          We checked the business website and public search results.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={discovery.searchDeeper}
            className="rounded-xl bg-primary px-3.5 py-2 text-[12px] font-bold text-primary-foreground"
          >
            Search deeper
          </button>
          <button
            type="button"
            onClick={() => {
              setManual(true);
              onManual();
            }}
            className="rounded-xl border border-border px-3.5 py-2 text-[12px] font-semibold"
          >
            Enter username
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="rounded-xl border border-accent/40 bg-accent/5 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="ready">
            {discovery.status === "verified" ? "Instagram verified ✓" : "Public Instagram found ✓"}
          </StatusChip>
          {best.scope === "brand" ? <StatusChip tone="idle">Brand-wide Instagram</StatusChip> : null}
        </div>
        <p className="mt-2 font-display text-[17px] font-bold tracking-tight">@{best.username}</p>
        <a
          href={best.profileUrl}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-[12px] text-primary underline"
        >
          {best.profileUrl}
        </a>
        <p className="mt-1 text-[12px] text-muted-foreground">Confidence: {confidenceWord(best.confidence)}</p>
        {best.evidence.slice(0, 3).map((e, i) => (
          <p key={i} className="text-[12px] text-muted-foreground">
            ✓ {e.label}
          </p>
        ))}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate({ value: best.username, scope: best.scope })}
            className="rounded-xl bg-primary px-3.5 py-2 text-[12px] font-bold text-primary-foreground disabled:opacity-60"
          >
            {used ? "Instagram set ✓" : "Use Instagram"}
          </button>
          <button
            type="button"
            onClick={() => {
              setManual(true);
              onManual();
            }}
            className="rounded-xl border border-border px-3.5 py-2 text-[12px] font-semibold"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => reject.mutate(best.username)}
            className="rounded-xl border border-border px-3.5 py-2 text-[12px] font-semibold"
          >
            That's not our account
          </button>
          <button
            type="button"
            onClick={discovery.searchDeeper}
            className="rounded-xl border border-border px-3.5 py-2 text-[12px] font-semibold"
          >
            Search again
          </button>
        </div>
      </div>

      {others.length ? (
        <div className="rounded-xl border border-border bg-card p-3.5">
          <p className="text-[12px] font-bold">We found a few possible Instagram accounts</p>
          {others.map((c) => (
            <div key={c.username} className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold">@{c.username}</p>
                <p className="text-[11px] text-muted-foreground">
                  {c.confidence}% match · {c.scope === "brand" ? "Brand-wide account" : "Location account"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => confirm.mutate({ value: c.username, scope: c.scope })}
                className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground"
              >
                Use this Instagram
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {manual ? (
        <p className="text-[12px] text-muted-foreground">Type the username or profile link in the field above.</p>
      ) : null}
    </div>
  );
}
