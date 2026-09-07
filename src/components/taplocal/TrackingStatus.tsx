import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel, SectionTitle, StatusChip } from "@/components/taplocal/Field";
import { getPlaqueTracking } from "@/lib/tap-test.functions";
import { nfcUrl, qrUrl, testUrl } from "@/lib/smartlink";

function when(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

/** Live tracking diagnostics: is this plaque actually recording taps? */
export function TrackingStatus({ plaqueId }: { plaqueId: string }) {
  const trackingFn = useServerFn(getPlaqueTracking);
  const [warn, setWarn] = useState(false);

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
          <Row label="Last NFC tap" value={when(t.lastNfcTap)} />
          <Row label="Last QR scan" value={when(t.lastQrScan)} />
          <Row label="Last event" value={t.lastEvent ? `${t.lastEvent.type} · ${when(t.lastEvent.at)}` : "Never"} />
          <Row label="Events today" value={String(t.eventsToday)} />
          <Row label="NFC today" value={String(t.nfcToday)} />
          <Row label="QR today" value={String(t.qrToday)} />
          <Row label="Interactions all time" value={String(t.interactionsAllTime)} />
          <Row label="Test events" value={String(t.testEvents)} />
          <Row label="Unconfigured taps" value={String(t.setupOpens)} />
          <Row label="Taps while off" value={String(t.inactiveTaps)} />
        </dl>

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
            Test tracking (no customer count)
          </a>
          <a
            href={testUrl(qrUrl(t.publicSlug))}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold"
          >
            Test QR tracking
          </a>
          {warn ? (
            <a
              href={nfcUrl(t.publicSlug)}
              target="_blank"
              rel="noreferrer"
              onClick={() => setWarn(false)}
              className="rounded-full bg-destructive px-3 py-1.5 text-[12px] font-semibold text-destructive-foreground"
            >
              Confirm — count as a real tap
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setWarn(true)}
              className="rounded-full border border-destructive/40 px-3 py-1.5 text-[12px] font-semibold text-destructive"
            >
              Count as real tap
            </button>
          )}
        </div>
        {warn ? (
          <p className="text-[12px] text-muted-foreground">
            This will add a real customer interaction to this business's numbers. Normal testing should use the test
            buttons above.
          </p>
        ) : null}
        <p className="text-[12px] text-muted-foreground">
          A test tap records SmartLink resolved, destination resolved and a test event — customer counts stay unchanged.
        </p>
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
