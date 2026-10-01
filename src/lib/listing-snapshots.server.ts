/**
 * Every Google listing refresh records review count + rating into
 * metric_snapshots so impact analytics, Results and admin all read one series.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveListingSnapshots(client: any, opts: {
  businessId: string | null | undefined;
  locationId: string | null | undefined;
  rating: number | null | undefined;
  reviewCount: number | null | undefined;
}) {
  if (!opts.businessId) return;
  const rows: Record<string, unknown>[] = [];
  const base = { business_id: opts.businessId, location_id: opts.locationId ?? null, metadata: { source: "google_places" } };
  if (typeof opts.reviewCount === "number") rows.push({ ...base, metric_type: "google_review_count", metric_value: opts.reviewCount });
  if (typeof opts.rating === "number") rows.push({ ...base, metric_type: "google_rating", metric_value: opts.rating });
  if (!rows.length) return;
  try {
    await client.from("metric_snapshots").insert(rows);
  } catch {
    /* snapshots are best-effort; never block a listing refresh */
  }
}
