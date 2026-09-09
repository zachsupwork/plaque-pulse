import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, StatusChip } from "@/components/taplocal/Field";
import { getPlaqueTracking, runTrackingCheck } from "@/lib/tap-test.functions";
import { nfcUrl, qrUrl, testUrl } from "@/lib/smartlink";

function when(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

/** Live tracking diagnostics: is this plaque actually recording taps? */
export function TrackingStatus({ plaqueId }: { plaqueId: string }) {
  const trackingFn = useServerFn(getPlaqueTracking);
  const checkFn = useServerFn(runTrackingCheck);
  const [realTest, setRealTest] = useState<"nfc" | "qr" | null>(null);

  const check = useMutation({ mutationFn: () => checkFn({ data: { plaqueId } }) });

  const q = useQuery({
    queryKey: ["plaque-tracking", plaqueId],
    queryFn: () => trackingFn({ data: { plaqueId } }),
    refetchInterval: 5_000,
  });


  const t = q.data?.ok ? q.data.tracking : null;
  if (!t) return null;

  const problems = [
    !t.businessAssigned ? "No business assigned" : null,
    !t.destinationUrl ? "No active destination" : null,
    t.status !== "active" ? `Plaque status is ${t.status}` : null,
  ].filter(Boolean) as string[];

  return (
    <div>
      <SectionTitle>Tracking status</SectionTitle>
      <GlassPanel className="space-y-3 p-3.5 text-[13px]">
        <div className="flex flex-wrap gap-1.5">
          <StatusChip tone={problems.length === 0 ? "ok" : "problem"}>
            {problems.length === 0 ? "Tracking healthy" : "Needs attention"}
          </StatusChip>
          <StatusChip tone={t.status === "active" ? "ok" : "attention"}>{t.status}</StatusChip>
        </div>

        {problems.map((p) => (
          <p key={p} className="text-[12px] font-semibold text-destructive">
            {p}
          </p>
        ))}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Row label="Plaque" value={t.plaqueCode} />
          <Row label="Slug" value={t.publicSlug} />
          <Row label="Business" value={t.business ?? "Unassigned"} />
          <Row label="Destination" value={t.destinationType ?? "None"} />
          <Row label="Last interaction" value={when(t.lastInteraction)} />
          <Row label="Last NFC tap" value={when(t.lastNfcTap)} />
          <Row label="Last QR scan" value={when(t.lastQrScan)} />
          <Row label="Last event" value={t.lastEvent ? `${t.lastEvent.type} · ${when(t.lastEvent.at)}` : "Never"} />
          <Row label="Interactions today" value={`${t.interactionsToday} (${t.nfcToday} NFC · ${t.qrToday} QR)`} />
          <Row label="Events today" value={String(t.eventsToday)} />
          <Row label="All time" value={`${t.interactionsAllTime} (${t.nfcAllTime} NFC · ${t.qrAllTime} QR)`} />
          <Row label="Admin test events" value={String(t.testEvents)} />
          <Row label="Tapped but not configured" value={String(t.setupOpens)} />
          <Row label="Tapped while paused" value={String(t.inactiveTaps)} />
        </dl>

        <p className="text-[11px] text-muted-foreground">Days shown in {t.timezone} time.</p>

        {t.destinationUrl ? (
          <p className="break-all text-[12px] text-muted-foreground">{t.destinationUrl}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <a
            href={testUrl(nfcUrl(t.publicSlug))}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold"
          >
            Test SmartLink — does not count
          </a>
          <a
            href={testUrl(qrUrl(t.publicSlug))}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold"
          >
            Test QR link — does not count
          </a>
          <button
            type="button"
            disabled={check.isPending}
            onClick={() => check.mutate()}
            className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[12px] font-semibold text-primary"
          >
            {check.isPending ? "Checking…" : "Run tracking check"}
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground">Admin tests are excluded from customer analytics.</p>

        {check.data?.ok ? (
          <ul className="space-y-1 rounded-xl border border-border bg-foreground/[0.03] p-3 text-[12px]">
            {check.data.checks.map((c) => (
              <li key={c.label} className="flex items-start justify-between gap-3">
                <span className={c.ok ? "font-semibold" : "font-semibold text-destructive"}>
                  {c.ok ? "✓" : "✕"} {c.label}
                </span>
                <span className="truncate text-right text-muted-foreground">{c.detail}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="rounded-xl border border-destructive/30 p-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-destructive">Record real test interaction</p>
          <p className="mt-1 text-[12px] text-muted-foreground">This will count as a real customer interaction.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["nfc", "qr"] as const).map((kind) =>
              realTest === kind ? (
                <a
                  key={kind}
                  href={kind === "nfc" ? nfcUrl(t.publicSlug) : qrUrl(t.publicSlug)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setRealTest(null)}
                  className="rounded-full bg-destructive px-3 py-1.5 text-[12px] font-semibold text-destructive-foreground"
                >
                  Confirm — count this {kind.toUpperCase()} interaction
                </a>
              ) : (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setRealTest(kind)}
                  className="rounded-full border border-destructive/40 px-3 py-1.5 text-[12px] font-semibold text-destructive"
                >
                  Test {kind.toUpperCase()}
                </button>
              ),
            )}
          </div>
        </div>

      </GlassPanel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  );
}
