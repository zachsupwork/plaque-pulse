import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { extractSmartLinkSlug } from "@/lib/smartlink";
import { REPORT_TIMEZONE, startOfTodayInTimezone, startOfWindowInTimezone } from "@/lib/report-time";

/**
 * The Places management centre.
 *
 * A "place" is one physical location where TapLocal plaques are installed. Every
 * aggregate below is computed on the server from the existing normalised records —
 * businesses, locations, plaques, destinations, programming and events — so the
 * browser never has to pull raw event rows to render a list.
 */

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function since(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Local reporting day boundary (America/Toronto), never a UTC day. */
function startOfToday() {
  return startOfTodayInTimezone();
}

/** Whole local days including today, for 7d/30d style windows. */
function windowStart(days: number) {
  return startOfWindowInTimezone(days);
}


/** Place ids are the location id, or b_<businessId> when a business has no location row. */
export function placeKeyForBusiness(businessId: string) {
  return `b_${businessId}`;
}

function parsePlaceKey(key: string): { kind: "location" | "business"; id: string } {
  return key.startsWith("b_") ? { kind: "business", id: key.slice(2) } : { kind: "location", id: key };
}

export type PlaqueAttention =
  | "no_destination"
  | "needs_programming"
  | "needs_verification"
  | "no_placement"
  | "paused"
  | "faulty";

const ATTENTION_LABEL: Record<PlaqueAttention, string> = {
  no_destination: "No destination",
  needs_programming: "NFC not programmed",
  needs_verification: "NFC unverified",
  no_placement: "No placement",
  paused: "Paused",
  faulty: "Faulty",
};

export function attentionLabel(key: string) {
  return ATTENTION_LABEL[key as PlaqueAttention] ?? key.replace(/_/g, " ");
}

type PlaqueRow = {
  id: string;
  plaque_code: string;
  public_slug: string;
  plaque_name: string | null;
  placement_type: string | null;
  product_type: string;
  style: string | null;
  base_type: string | null;
  batch_id: string | null;
  status: string;
  business_id: string | null;
  location_id: string | null;
  activated_at: string | null;
  created_at: string;
};

function plaqueAttention(args: {
  status: string;
  destination: string | null;
  placement: string | null;
  writeStatus: string;
  verificationStatus: string;
}): PlaqueAttention[] {
  const out: PlaqueAttention[] = [];
  if (args.status === "faulty") out.push("faulty");
  if (args.status === "paused") out.push("paused");
  if (!args.destination) out.push("no_destination");
  if (!args.placement) out.push("no_placement");
  const written = args.writeStatus === "written" || args.writeStatus === "preprogrammed" || args.writeStatus === "verified";
  if (!written) out.push("needs_programming");
  else if (args.verificationStatus !== "verified") out.push("needs_verification");
  return out;
}

/** Loads everything the Places screens need, already joined and de-demoed. */
async function loadNetwork(client: Awaited<ReturnType<typeof db>>) {
  const { data: businesses } = await client
    .from("businesses")
    .select("id, name, industry, status, is_demo, created_at, updated_at")
    .eq("is_demo", false)
    .limit(2000);

  const bizIds = (businesses ?? []).map((b) => b.id);
  const bizSet = new Set(bizIds);

  const [{ data: locations }, { data: plaques }, { data: members }, { data: social }] = await Promise.all([
    client
      .from("locations")
      .select(
        "id, business_id, name, address, city, province_state, phone, website_url, google_place_id, google_maps_uri, google_rating, google_review_count, google_review_url, google_primary_type, active, created_at",
      )
      .limit(5000),
    client
      .from("plaques")
      .select(
        "id, plaque_code, public_slug, plaque_name, placement_type, product_type, style, base_type, batch_id, status, business_id, location_id, activated_at, created_at",
      )
      .limit(5000),
    client.from("business_members").select("business_id, user_id, role").limit(5000),
    client.from("business_social_profiles").select("business_id, location_id, platform, username, profile_url").limit(5000),
  ]);

  const realPlaques = ((plaques ?? []) as PlaqueRow[]).filter((p) => p.business_id && bizSet.has(p.business_id));
  const plaqueIds = realPlaques.map((p) => p.id);

  const [{ data: programming }, { data: destinations }, { data: events }] = await Promise.all([
    plaqueIds.length
      ? client.from("plaque_programming").select("plaque_id, write_status, verification_status, batch_id").in("plaque_id", plaqueIds)
      : Promise.resolve({ data: [] as { plaque_id: string; write_status: string; verification_status: string; batch_id: string | null }[] }),
    plaqueIds.length
      ? client
          .from("destinations")
          .select("plaque_id, destination_type, url, effective_to")
          .in("plaque_id", plaqueIds)
          .is("effective_to", null)
      : Promise.resolve({ data: [] as { plaque_id: string; destination_type: string; url: string; effective_to: string | null }[] }),
    plaqueIds.length
      ? client
          .from("events")
          .select("plaque_id, business_id, event_type, source_type, occurred_at")
          .in("plaque_id", plaqueIds)
          .eq("event_type", "interaction")
          .gte("occurred_at", since(30))
          .limit(100000)
      : Promise.resolve({ data: [] as { plaque_id: string | null; business_id: string | null; event_type: string; source_type: string | null; occurred_at: string }[] }),
  ]);

  return {
    businesses: businesses ?? [],
    locations: (locations ?? []).filter((l) => bizSet.has(l.business_id)),
    plaques: realPlaques,
    members: (members ?? []).filter((m) => bizSet.has(m.business_id)),
    social: social ?? [],
    programming: programming ?? [],
    destinations: destinations ?? [],
    events: events ?? [],
  };
}

type BuiltPlace = ReturnType<typeof buildPlaces>[number];

function buildPlaces(net: Awaited<ReturnType<typeof loadNetwork>>) {
  const today = startOfToday();
  const in7 = windowStart(7);

  const progBy = new Map(net.programming.map((p) => [p.plaque_id, p]));
  const destBy = new Map(net.destinations.map((d) => [d.plaque_id, d]));
  const eventsBy = new Map<string, { nfc: number; qr: number; total: number; today: number; days7: number; last: string | null }>();
  for (const e of net.events) {
    if (!e.plaque_id) continue;
    const bucket = eventsBy.get(e.plaque_id) ?? { nfc: 0, qr: 0, total: 0, today: 0, days7: 0, last: null };
    bucket.total += 1;
    if (e.source_type === "nfc") bucket.nfc += 1;
    if (e.source_type === "qr") bucket.qr += 1;
    if (e.occurred_at >= today) bucket.today += 1;
    if (e.occurred_at >= in7) bucket.days7 += 1;
    if (!bucket.last || e.occurred_at > bucket.last) bucket.last = e.occurred_at;
    eventsBy.set(e.plaque_id, bucket);
  }

  const bizById = new Map(net.businesses.map((b) => [b.id, b]));
  const locById = new Map(net.locations.map((l) => [l.id, l]));

  const plaqueCard = (p: PlaqueRow) => {
    const prog = progBy.get(p.id) ?? null;
    const dest = destBy.get(p.id) ?? null;
    const stats = eventsBy.get(p.id) ?? { nfc: 0, qr: 0, total: 0, today: 0, days7: 0, last: null };
    const writeStatus = prog?.write_status ?? "not_programmed";
    const verificationStatus = prog?.verification_status ?? "unverified";
    return {
      id: p.id,
      plaqueCode: p.plaque_code,
      slug: p.public_slug,
      name: p.plaque_name,
      placement: p.placement_type,
      productType: p.product_type,
      style: p.style,
      baseType: p.base_type,
      batchId: p.batch_id ?? prog?.batch_id ?? null,
      status: p.status,
      activatedAt: p.activated_at,
      createdAt: p.created_at,
      writeStatus,
      verificationStatus,
      destinationType: dest?.destination_type ?? null,
      destinationUrl: dest?.url ?? null,
      today: stats.today,
      days7: stats.days7,
      days30: stats.total,
      nfc30: stats.nfc,
      qr30: stats.qr,
      lastInteraction: stats.last,
      attention: plaqueAttention({
        status: p.status,
        destination: dest?.url ?? null,
        placement: p.placement_type,
        writeStatus,
        verificationStatus,
      }),
    };
  };

  // Every location is a place; a business with plaques but no location row still needs one.
  const places = net.locations.map((l) => ({ key: l.id, businessId: l.business_id, location: l }));
  const locatedBusinesses = new Set(net.locations.map((l) => l.business_id));
  for (const b of net.businesses) {
    if (!locatedBusinesses.has(b.id) && net.plaques.some((p) => p.business_id === b.id)) {
      places.push({ key: placeKeyForBusiness(b.id), businessId: b.id, location: null as never });
    }
  }

  return places.map((place) => {
    const business = bizById.get(place.businessId)!;
    const loc = place.location ? locById.get(place.location.id) ?? null : null;
    const businessLocations = net.locations.filter((l) => l.business_id === place.businessId);
    const isOnlyPlace = businessLocations.length <= 1;

    const plaques = net.plaques
      .filter((p) => {
        if (p.business_id !== place.businessId) return false;
        if (loc) return p.location_id === loc.id || (p.location_id === null && isOnlyPlace);
        return true;
      })
      .map(plaqueCard)
      .sort((a, b) => a.plaqueCode.localeCompare(b.plaqueCode));

    const instagram =
      net.social.find(
        (s) => s.platform === "instagram" && s.business_id === place.businessId && (!loc || !s.location_id || s.location_id === loc.id),
      ) ?? null;

    const memberCount = net.members.filter((m) => m.business_id === place.businessId).length;
    const sum = (pick: (p: (typeof plaques)[number]) => number) => plaques.reduce((n, p) => n + pick(p), 0);

    return {
      key: place.key,
      businessId: place.businessId,
      locationId: loc?.id ?? null,
      businessName: business.name,
      industry: business.industry,
      businessStatus: business.status,
      locationName: loc?.name ?? business.name,
      address: loc?.address ?? null,
      city: loc?.city ?? null,
      province: loc?.province_state ?? null,
      phone: loc?.phone ?? null,
      website: loc?.website_url ?? null,
      googlePlaceId: loc?.google_place_id ?? null,
      googleMapsUri: loc?.google_maps_uri ?? null,
      googleReviewUrl: loc?.google_review_url ?? null,
      googleRating: loc?.google_rating ?? null,
      googleReviews: loc?.google_review_count ?? null,
      googleCategory: loc?.google_primary_type ?? null,
      instagramUsername: instagram?.username ?? null,
      instagramUrl: instagram?.profile_url ?? null,
      multiLocation: businessLocations.length > 1,
      memberCount,
      ownerClaimed: memberCount > 0,
      plaqueCount: plaques.length,
      activePlaqueCount: plaques.filter((p) => p.status === "active").length,
      attentionCount: plaques.filter((p) => p.attention.length > 0).length,
      batches: [...new Set(plaques.map((p) => p.batchId).filter(Boolean))] as string[],
      today: sum((p) => p.today),
      days7: sum((p) => p.days7),
      days30: sum((p) => p.days30),
      nfc30: sum((p) => p.nfc30),
      qr30: sum((p) => p.qr30),
      lastInteraction: plaques.reduce<string | null>(
        (acc, p) => (p.lastInteraction && (!acc || p.lastInteraction > acc) ? p.lastInteraction : acc),
        null,
      ),
      plaques,
    };
  });
}

function matchesQuery(place: BuiltPlace, q: string) {
  if (!q) return { hit: true, matchedPlaques: [] as string[] };
  const haystack = [
    place.businessName,
    place.locationName,
    place.address,
    place.city,
    place.province,
    place.phone,
    place.website,
    place.googlePlaceId,
    place.instagramUsername,
    place.industry,
    place.googleCategory,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const matchedPlaques = place.plaques
    .filter((p) =>
      [p.plaqueCode, p.slug, p.name, p.batchId, p.destinationUrl, p.destinationType, p.placement, `/n/${p.slug}`, `/q/${p.slug}`]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
    .map((p) => p.id);

  return { hit: haystack.includes(q) || matchedPlaques.length > 0, matchedPlaques };
}

const FILTERS = [
  "all",
  "active",
  "needs_attention",
  "needs_setup",
  "needs_programming",
  "needs_verification",
  "no_destination",
  "no_placement",
  "unclaimed",
  "installed",
  "paused",
  "faulty",
] as const;

const SORTS = [
  "recent",
  "name",
  "most_plaques",
  "most_interactions",
  "recently_installed",
  "attention_first",
  "batch",
] as const;

/** Summary counters for the Places header and the admin dashboard. */
export const placesOverview = createServerFn({ method: "POST" }).handler(async () => {
  const caller = await gate();
  if (!caller.ok) return { ok: false as const, error: caller.error };
  const places = buildPlaces(await loadNetwork(await db()));
  const withPlaques = places.filter((p) => p.plaqueCount > 0);
  return {
    ok: true as const,
    activePlaces: withPlaques.filter((p) => p.activePlaqueCount > 0).length,
    placesWithPlaques: withPlaques.length,
    activePlaques: places.reduce((n, p) => n + p.activePlaqueCount, 0),
    totalPlaques: places.reduce((n, p) => n + p.plaqueCount, 0),
    needsAttention: places.reduce((n, p) => n + p.attentionCount, 0),
    unclaimedOwners: withPlaques.filter((p) => !p.ownerClaimed).length,
  };
});

/** The Places list: one row per physical location, plaques grouped underneath. */
export const listPlaces = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        query: z.string().max(160).default(""),
        filter: z.string().max(40).default("all"),
        sort: z.string().max(40).default("recent"),
        city: z.string().max(80).default(""),
        batch: z.string().max(80).default(""),
        destination: z.string().max(40).default(""),
        limit: z.number().int().min(10).max(500).default(60),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, places: [], total: 0, cities: [], batches: [] };

    const all = buildPlaces(await loadNetwork(await db()));
    // A pasted SmartLink (any host, any format) is reduced to its slug so the
    // printed QR, the NFC link and the bare slug all find the same plaque.
    const rawQuery = data.query.trim();
    const parsedLink = extractSmartLinkSlug(rawQuery);
    const q = (parsedLink?.slug ?? rawQuery).toLowerCase();
    const filter = (FILTERS as readonly string[]).includes(data.filter) ? data.filter : "all";
    const sort = (SORTS as readonly string[]).includes(data.sort) ? data.sort : "recent";

    const cities = [...new Set(all.map((p) => p.city).filter(Boolean))].sort() as string[];
    const batches = [...new Set(all.flatMap((p) => p.batches))].sort();

    let rows = all
      .map((place) => {
        const { hit, matchedPlaques } = matchesQuery(place, q);
        return { ...place, hit, matchedPlaques };
      })
      .filter((p) => p.hit);

    if (data.city) rows = rows.filter((p) => p.city === data.city);
    if (data.batch) rows = rows.filter((p) => p.batches.includes(data.batch));
    if (data.destination) rows = rows.filter((p) => p.plaques.some((x) => x.destinationType === data.destination));

    const anyPlaque = (p: BuiltPlace, test: (x: BuiltPlace["plaques"][number]) => boolean) => p.plaques.some(test);
    rows = rows.filter((p) => {
      switch (filter) {
        case "active":
          return p.activePlaqueCount > 0;
        case "needs_attention":
          return p.attentionCount > 0;
        case "needs_setup":
          return p.plaqueCount === 0 || anyPlaque(p, (x) => !x.destinationUrl || !x.placement);
        case "needs_programming":
          return anyPlaque(p, (x) => x.attention.includes("needs_programming"));
        case "needs_verification":
          return anyPlaque(p, (x) => x.attention.includes("needs_verification"));
        case "no_destination":
          return anyPlaque(p, (x) => !x.destinationUrl);
        case "no_placement":
          return anyPlaque(p, (x) => !x.placement);
        case "unclaimed":
          return !p.ownerClaimed && p.plaqueCount > 0;
        case "installed":
          return p.plaqueCount > 0;
        case "paused":
          return anyPlaque(p, (x) => x.status === "paused");
        case "faulty":
          return anyPlaque(p, (x) => x.status === "faulty");
        default:
          return true;
      }
    });

    rows.sort((a, b) => {
      switch (sort) {
        case "name":
          return a.businessName.localeCompare(b.businessName);
        case "most_plaques":
          return b.plaqueCount - a.plaqueCount;
        case "most_interactions":
          return b.days30 - a.days30;
        case "recently_installed":
          return (b.plaques[0]?.activatedAt ?? "").localeCompare(a.plaques[0]?.activatedAt ?? "");
        case "attention_first":
          return b.attentionCount - a.attentionCount || b.days30 - a.days30;
        case "batch":
          return (a.batches[0] ?? "zzz").localeCompare(b.batches[0] ?? "zzz");
        default:
          return (b.lastInteraction ?? b.plaques[0]?.createdAt ?? "").localeCompare(
            a.lastInteraction ?? a.plaques[0]?.createdAt ?? "",
          );
      }
    });

    return { ok: true as const, total: rows.length, places: rows.slice(0, data.limit), cities, batches };
  });

/** The complete operational record for one place. */
export const getPlaceDetail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ placeId: z.string().min(1).max(80) }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, place: null, activity: [], owners: [], duplicates: [] };
    const client = await db();

    const net = await loadNetwork(client);
    const places = buildPlaces(net);
    const place = places.find((p) => p.key === data.placeId) ?? null;
    if (!place) return { ok: true as const, error: null, place: null, activity: [], owners: [], duplicates: [] };

    const plaqueIds = place.plaques.map((p) => p.id);

    const [{ data: rawEvents }, { data: history }, { data: members }] = await Promise.all([
      plaqueIds.length
        ? client
            .from("events")
            .select("plaque_id, event_type, source_type, occurred_at")
            .in("plaque_id", plaqueIds)
            .eq("event_type", "interaction")
            .limit(100000)
        : Promise.resolve({ data: [] as { plaque_id: string | null; event_type: string; source_type: string | null; occurred_at: string }[] }),
      client
        .from("action_history")
        .select("action_type, initiated_by, created_at, plaque_id, new_value")
        .eq("business_id", place.businessId)
        .order("created_at", { ascending: false })
        .limit(40),
      client.from("business_members").select("user_id, role, created_at").eq("business_id", place.businessId),
    ]);

    const codeById = new Map(place.plaques.map((p) => [p.id, p.plaqueCode]));
    const placementById = new Map(place.plaques.map((p) => [p.id, p.placement]));

    const interactions = rawEvents ?? [];
    const inWindow = (days: number) => interactions.filter((e) => e.occurred_at >= windowStart(days)).length;

    const perPlaque = place.plaques.map((p) => ({
      id: p.id,
      plaqueCode: p.plaqueCode,
      placement: p.placement,
      allTime: interactions.filter((e) => e.plaque_id === p.id).length,
    }));
    const allTimeTotal = interactions.length;

    // Owner identities come from the auth admin API, never from a client query.
    const owners: { userId: string; role: string; email: string | null; name: string | null; joinedAt: string }[] = [];
    if ((members ?? []).length) {
      const ids = (members ?? []).map((m) => m.user_id);
      const { data: profiles } = await client.from("profiles").select("user_id, first_name, last_name").in("user_id", ids);
      const list = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const m of members ?? []) {
        const profile = (profiles ?? []).find((p) => p.user_id === m.user_id);
        owners.push({
          userId: m.user_id,
          role: m.role,
          joinedAt: m.created_at,
          email: list.data.users.find((u) => u.id === m.user_id)?.email ?? null,
          name: profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null : null,
        });
      }
    }

    const activity = [
      ...interactions
        .slice()
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
        .slice(0, 25)
        .map((e) => ({
          at: e.occurred_at,
          label: e.source_type === "qr" ? "QR scan" : e.source_type === "nfc" ? "NFC tap" : "Interaction",
          plaqueCode: e.plaque_id ? (codeById.get(e.plaque_id) ?? "") : "",
          placement: e.plaque_id ? (placementById.get(e.plaque_id) ?? null) : null,
        })),
      ...(history ?? []).map((h) => ({
        at: h.created_at,
        label: `${h.action_type.replace(/_/g, " ")} (${h.initiated_by})`,
        plaqueCode: h.plaque_id ? (codeById.get(h.plaque_id) ?? "") : "",
        placement: null as string | null,
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 40);

    // Possible duplicates: same Google listing, or a very similar name in the same city.
    const duplicates = places
      .filter((p) => p.key !== place.key)
      .filter(
        (p) =>
          (place.googlePlaceId && p.googlePlaceId === place.googlePlaceId) ||
          (p.businessName.trim().toLowerCase() === place.businessName.trim().toLowerCase() && p.city === place.city),
      )
      .map((p) => ({
        key: p.key,
        businessName: p.businessName,
        address: p.address,
        city: p.city,
        plaqueCount: p.plaqueCount,
        strong: Boolean(place.googlePlaceId && p.googlePlaceId === place.googlePlaceId),
      }));

    return {
      ok: true as const,
      error: null,
      place: {
        ...place,
        siblingLocations: places
          .filter((p) => p.businessId === place.businessId && p.key !== place.key)
          .map((p) => ({ key: p.key, name: p.locationName, city: p.city, plaqueCount: p.plaqueCount })),
        analytics: {
          timezone: REPORT_TIMEZONE,
          today: interactions.filter((e) => e.occurred_at >= startOfToday()).length,
          todayNfc: interactions.filter((e) => e.occurred_at >= startOfToday() && e.source_type === "nfc").length,
          todayQr: interactions.filter((e) => e.occurred_at >= startOfToday() && e.source_type === "qr").length,
          days7: inWindow(7),
          days7Nfc: interactions.filter((e) => e.occurred_at >= windowStart(7) && e.source_type === "nfc").length,
          days7Qr: interactions.filter((e) => e.occurred_at >= windowStart(7) && e.source_type === "qr").length,
          days30: inWindow(30),
          allTime: allTimeTotal,
          nfc: interactions.filter((e) => e.source_type === "nfc").length,
          qr: interactions.filter((e) => e.source_type === "qr").length,
          lastInteraction: interactions.reduce<string | null>(
            (acc, e) => (!acc || e.occurred_at > acc ? e.occurred_at : acc),
            null,
          ),

          perPlaque: perPlaque
            .map((p) => ({ ...p, share: allTimeTotal ? Math.round((p.allTime / allTimeTotal) * 100) : 0 }))
            .sort((a, b) => b.allTime - a.allTime),
        },
      },
      activity,
      owners,
      duplicates,
    };
  });

/** Change where one plaque sends people. The physical tag is never rewritten. */
export const changePlaqueDestination = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        plaqueId: z.string().uuid(),
        destinationType: z.string().min(1).max(40),
        url: z.string().max(600).default(""),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, business_id, location_id")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque?.business_id) return { ok: false as const, error: "not_assigned" as const };

    let url = data.url.trim();
    if (!url && (data.destinationType === "google_review" || data.destinationType === "directions")) {
      const { data: location } = await client
        .from("locations")
        .select("google_place_id, google_maps_uri")
        .eq("id", plaque.location_id ?? "00000000-0000-0000-0000-000000000000")
        .maybeSingle();
      if (data.destinationType === "google_review") {
        const { reviewDestinationForLocation } = await import("./google-link.server");
        url = (await reviewDestinationForLocation(client, plaque.location_id ?? null)).url ?? "";
      } else {
        url =
          location?.google_maps_uri ??
          (location?.google_place_id
            ? `https://www.google.com/maps/search/?api=1&query=place&query_place_id=${encodeURIComponent(location.google_place_id)}`
            : "");
      }
    }
    if (!url) return { ok: false as const, error: "no_destination" as const };

    const now = new Date().toISOString();
    const { data: current } = await client
      .from("destinations")
      .select("id, destination_type, url")
      .eq("plaque_id", plaque.id)
      .is("effective_to", null)
      .maybeSingle();

    if (current?.url === url && current?.destination_type === data.destinationType) {
      return { ok: true as const, error: null, url, unchanged: true };
    }

    if (current) await client.from("destinations").update({ effective_to: now, active: false }).eq("id", current.id);
    await client.from("destinations").insert({
      business_id: plaque.business_id,
      plaque_id: plaque.id,
      destination_type: data.destinationType as never,
      url,
      active: true,
      effective_from: now,
    });

    await client.from("action_history").insert({
      business_id: plaque.business_id,
      plaque_id: plaque.id,
      action_type: "destination_changed",
      previous_value: current ? ({ destination_type: current.destination_type, url: current.url } as never) : null,
      new_value: { destination_type: data.destinationType, url } as never,
      initiated_by: "admin",
      approved_by_user_id: caller.userId,
    });

    return { ok: true as const, error: null, url, unchanged: false };
  });

/** Move a plaque to a different spot in the room, preserving placement history. */
export const changePlaquePlacement = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid(), placement: z.string().min(1).max(40) }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, business_id, location_id, placement_type")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque?.business_id) return { ok: false as const, error: "not_assigned" as const };
    if (plaque.placement_type === data.placement) return { ok: true as const, error: null };

    const now = new Date().toISOString();
    await client.from("plaques").update({ placement_type: data.placement }).eq("id", plaque.id);
    await client
      .from("plaque_placement_history")
      .update({ effective_to: now })
      .eq("plaque_id", plaque.id)
      .is("effective_to", null);
    await client.from("plaque_placement_history").insert({
      plaque_id: plaque.id,
      location_id: plaque.location_id,
      placement_type: data.placement,
      placement_name: data.placement,
      effective_from: now,
      changed_by_user_id: caller.userId,
    });
    await client.from("action_history").insert({
      business_id: plaque.business_id,
      plaque_id: plaque.id,
      action_type: "placement_changed",
      previous_value: { placement: plaque.placement_type } as never,
      new_value: { placement: data.placement } as never,
      initiated_by: "admin",
      approved_by_user_id: caller.userId,
    });

    return { ok: true as const, error: null };
  });

/** Which place does this plaque belong to? Used for cross-linking from the hardware list. */
export const placeForPlaque = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, place: null };
    const client = await db();

    const { data: plaque } = await client
      .from("plaques")
      .select("id, business_id, location_id")
      .eq("id", data.plaqueId)
      .maybeSingle();
    if (!plaque?.business_id) return { ok: true as const, error: null, place: null };

    const { data: business } = await client.from("businesses").select("id, name").eq("id", plaque.business_id).maybeSingle();
    const { data: locations } = await client
      .from("locations")
      .select("id, name, address, city")
      .eq("business_id", plaque.business_id)
      .order("created_at", { ascending: true });

    const loc = plaque.location_id
      ? ((locations ?? []).find((l) => l.id === plaque.location_id) ?? null)
      : ((locations ?? [])[0] ?? null);

    return {
      ok: true as const,
      error: null,
      place: {
        key: loc?.id ?? placeKeyForBusiness(plaque.business_id),
        businessId: plaque.business_id,
        businessName: business?.name ?? "Unassigned",
        locationName: loc?.name ?? null,
        address: loc?.address ?? null,
        city: loc?.city ?? null,
      },
    };
  });

export type PlacesFilter = (typeof FILTERS)[number];
export type PlacesSort = (typeof SORTS)[number];
export { parsePlaceKey };
