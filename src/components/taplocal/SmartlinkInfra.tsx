import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import { Chip, Label, Row } from "@/components/taplocal/NfcKit";
import { smartlinkInfrastructure } from "@/lib/smartlink.functions";
import { smartlinkBase } from "@/lib/smartlink";

/** Hostname the app used before the TapLocal rename. Tags carrying it must never ship. */
export const LEGACY_SMARTLINK_HOST = "plaque-pulse.lovable.app";

/** Live status of the TapLocal domains that SmartLinks depend on. */
export function useSmartlinkInfrastructure() {
  const load = useServerFn(smartlinkInfrastructure);
  return useQuery({ queryKey: ["smartlink-infrastructure"], queryFn: () => load(), staleTime: 60_000 });
}

export function SmartlinkInfraPanel() {
  const { data, isLoading } = useSmartlinkInfrastructure();

  function status(active?: boolean) {
    if (isLoading || active === undefined) return <Chip tone="idle">Checking…</Chip>;
    return active ? <Chip tone="ok">Active ✓</Chip> : <Chip tone="bad">Not configured</Chip>;
  }

  return (
    <GlassPanel className="p-4">
      <Label>SmartLink infrastructure</Label>
      <div className="mt-2">
        <Row label="TapLocal main domain" value={<span className="font-mono">taplocaldigital.com</span>} />
        <Row label="Status" value={status(data?.mainDomain.active)} />
        <Row label="SmartLink domain" value={<span className="font-mono">go.taplocaldigital.com</span>} />
        <Row label="Status" value={status(data?.smartlinkDomain.active)} />
        <Row label="Links currently issued from" value={<span className="font-mono break-all">{data?.base ?? "…"}</span>} />
        <Row
          label="Mode"
          value={
            isLoading ? (
              <Chip tone="idle">Checking…</Chip>
            ) : data?.production ? (
              <Chip tone="ok">Production SmartLink</Chip>
            ) : (
              <Chip tone="warn">Development SmartLink</Chip>
            )
          }
        />
      </div>
      {data && !data.production ? (
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          The short SmartLink domain isn&apos;t live yet, so tags are issued against the published TapLocal address.
          Those links work today, and every tag keeps working when the short domain goes live.
        </p>
      ) : null}
    </GlassPanel>
  );
}

/**
 * Manufacturing guard: shows the host every new tag URL is being minted against,
 * and hard-stops programming if a link still carries the old Lovable hostname.
 */
export function SmartlinkHostCheck({ urls }: { urls: string[] }) {
  const host = (() => {
    try {
      return new URL(smartlinkBase()).host;
    } catch {
      return smartlinkBase();
    }
  })();
  const stale = urls.some((u) => u.includes(LEGACY_SMARTLINK_HOST));

  return (
    <GlassPanel className={`p-4 ${stale ? "border-destructive/40" : ""}`}>
      <Label>Current SmartLink host</Label>
      <p className="mt-1 font-mono text-[13px] font-bold break-all">{host}</p>
      {stale ? (
        <p className="mt-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[12px] font-bold text-destructive">
          OLD HOST DETECTED — DO NOT PROGRAM THIS PLAQUE
        </p>
      ) : (
        <p className="mt-2 text-[12px] text-muted-foreground">Safe to program — links match the live host.</p>
      )}
    </GlassPanel>
  );
}
