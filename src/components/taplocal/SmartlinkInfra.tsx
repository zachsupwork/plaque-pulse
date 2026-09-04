import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import { Chip, Label, Row } from "@/components/taplocal/NfcKit";
import { smartlinkInfrastructure } from "@/lib/smartlink.functions";

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
