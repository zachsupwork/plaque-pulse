/**
 * Demo isolation for the platform-owner console.
 *
 * The customer-facing demo business (and everything hanging off it) must never
 * appear in real TapLocal operations. Every admin read resolves the demo
 * business ids once and filters through these helpers, so the rule lives in a
 * single place instead of being re-implemented per query.
 */

type AnyClient = { from: (table: string) => any };

export type DemoScope = {
  demoBusinessIds: Set<string>;
  demoPlaqueIds: Set<string>;
  /** True when the row belongs to the demo business (or one of its plaques). */
  isDemoRow: (row: { business_id?: string | null; plaque_id?: string | null; id?: string | null }) => boolean;
};

export async function getDemoScope(client: AnyClient): Promise<DemoScope> {
  const { data: demoBusinesses } = await client.from("businesses").select("id").eq("is_demo", true);
  const demoBusinessIds = new Set<string>((demoBusinesses ?? []).map((b: { id: string }) => b.id));

  let demoPlaqueIds = new Set<string>();
  if (demoBusinessIds.size) {
    const { data: demoPlaques } = await client
      .from("plaques")
      .select("id")
      .in("business_id", [...demoBusinessIds]);
    demoPlaqueIds = new Set<string>((demoPlaques ?? []).map((p: { id: string }) => p.id));
  }

  return {
    demoBusinessIds,
    demoPlaqueIds,
    isDemoRow: (row) => {
      if (row.business_id && demoBusinessIds.has(row.business_id)) return true;
      if (row.plaque_id && demoPlaqueIds.has(row.plaque_id)) return true;
      return false;
    },
  };
}

/** Keep only rows that belong to real (non-demo) operations. */
export function realOnly<T extends { business_id?: string | null; plaque_id?: string | null }>(
  rows: T[] | null | undefined,
  scope: DemoScope,
): T[] {
  return (rows ?? []).filter((r) => !scope.isDemoRow(r));
}
