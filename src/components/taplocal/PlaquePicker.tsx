import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassPanel } from "@/components/taplocal/Field";
import { Chip } from "@/components/taplocal/NfcKit";
import { searchPlaques } from "@/lib/nfc.functions";
import type { ProgrammablePlaque } from "@/components/taplocal/NfcKit";

/** Search inventory by plaque ID, public slug or batch. */
export function PlaquePicker({ onSelect }: { onSelect: (plaque: ProgrammablePlaque) => void }) {
  const search = useServerFn(searchPlaques);
  const [query, setQuery] = useState("");

  const results = useQuery({
    queryKey: ["plaque-search", query],
    queryFn: () => search({ data: { query } }),
  });

  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search TL-001247, X8K2P4 or BATCH-2026-014"
        className="w-full rounded-xl border border-border bg-foreground/5 px-3.5 py-3 text-[14px] outline-none focus:border-primary/60"
      />
      {results.data && !results.data.ok ? (
        <p className="text-[13px] text-destructive">You need an admin account to browse inventory.</p>
      ) : null}
      <div className="space-y-2">
        {(results.data?.plaques ?? []).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p as ProgrammablePlaque)}
            className="w-full text-left"
          >
            <GlassPanel className="flex items-center justify-between gap-3 p-3.5">
              <div>
                <p className="text-[14px] font-bold">{p.plaque_code}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  /n/{p.public_slug} · {p.product_type}
                  {p.batch_id ? ` · ${p.batch_id}` : ""}
                </p>
              </div>
              <Chip tone={p.status === "inventory" ? "idle" : "warn"}>{p.status}</Chip>
            </GlassPanel>
          </button>
        ))}
        {results.isFetched && (results.data?.plaques ?? []).length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No plaques match that search.</p>
        ) : null}
      </div>
    </div>
  );
}
