import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Platform-owner data access. Every function verifies the caller is a TapLocal
 * admin with their OWN session first, and only then uses the privileged client.
 */

type Denied = { ok: false; error: "unauthorized" | "forbidden" };

async function gate() {
  const { requireAdmin } = await import("@/lib/admin-auth.server");
  return requireAdmin();
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function since(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Signed-in identity + whether they hold the admin role. */
export const adminIdentity = createServerFn({ method: "POST" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { createClient } = await import("@supabase/supabase-js");
  const authHeader = getRequest().headers.get("authorization") ?? "";
  if (!authHeader) return { signedIn: false, isAdmin: false, email: null as string | null };

  const caller = createClient(
    process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authHeader } } },
  );
  const user = (await caller.auth.getUser()).data.user;
  if (!user) return { signedIn: false, isAdmin: false, email: null as string | null };

  // Verified-session identity only: never an email or id supplied by the browser.
  const { ensureBootstrapAdmin } = await import("@/lib/admin-bootstrap.server");
  await ensureBootstrapAdmin(user.id, user.email);

  const { data: roleRow } = await caller
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  return { signedIn: true, isAdmin: Boolean(roleRow), email: user.email ?? null };
});

/** Demo isolation helper, loaded lazily so it stays server-only. */
async function scopeFor(client: Awaited<ReturnType<typeof db>>) {
  const { getDemoScope } = await import("@/lib/admin-scope.server");
  return getDemoScope(client as never);
}

/** Network-wide counters for the admin dashboard. Real data only — never demo. */
export const networkOverview = createServerFn({ method: "POST" }).handler(async () => {
  const caller = await gate();
  if (!caller.ok) return { ok: false as const, error: caller.error };
  const client = await db();
  const scope = await scopeFor(client);

  const { data: allBusinesses } = await client.from("businesses").select("id, status, created_at, is_demo");
  const businesses = (allBusinesses ?? []).filter((b) => !b.is_demo);
  const { data: allPlaques } = await client.from("plaques").select("id, status, activated_at, business_id");
  const plaques = (allPlaques ?? []).filter((p) => !p.business_id || !scope.demoBusinessIds.has(p.business_id));
  const { data: rawEvents } = await client
    .from("events")
    .select("business_id, plaque_id, event_type, source_type, occurred_at")
    .gte("occurred_at", since(30))
    .limit(50000);
  const events = (rawEvents ?? []).filter((e) => !scope.isDemoRow(e));

  const interactions = events.filter((e) => e.event_type === "interaction");
  const today = startOfToday();
  const in7 = since(7);
  const monthStart = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString();

  const countStatus = (s: string) => plaques.filter((p) => p.status === s).length;

  return {
    ok: true as const,
    businessesTotal: businesses.length,
    businessesActive: businesses.filter((b) => b.status === "active").length,
    businessesThisMonth: businesses.filter((b) => b.created_at >= monthStart).length,
    plaquesTotal: plaques.length,
    plaquesInventory: countStatus("inventory"),
    plaquesConfigured: countStatus("configured_unclaimed"),
    plaquesActive: countStatus("active"),
    plaquesPacked: countStatus("packed"),
    plaquesFaulty: countStatus("faulty"),
    plaquesActivatedThisMonth: plaques.filter((p) => (p.activated_at ?? "") >= monthStart).length,
    interactionsToday: interactions.filter((e) => e.occurred_at >= today).length,
    nfcToday: interactions.filter((e) => e.occurred_at >= today && e.source_type === "nfc").length,
    qrToday: interactions.filter((e) => e.occurred_at >= today && e.source_type === "qr").length,
    interactions7: interactions.filter((e) => e.occurred_at >= in7).length,
    interactions30: interactions.length,
  };
});


/** Newest real taps, scans and account changes. Demo activity is excluded. */
export const networkActivity = createServerFn({ method: "POST" }).handler(async () => {
  const caller = await gate();
  if (!caller.ok) return { ok: false as const, error: caller.error, items: [] };
  const client = await db();
  const scope = await scopeFor(client);

  const { data: rawEvents } = await client
    .from("events")
    .select("business_id, plaque_id, event_type, source_type, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(200);
  const { data: rawActions } = await client
    .from("action_history")
    .select("business_id, plaque_id, action_type, initiated_by, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const events = (rawEvents ?? []).filter((e) => !scope.isDemoRow(e)).slice(0, 25);
  const actions = (rawActions ?? []).filter((a) => !scope.isDemoRow(a)).slice(0, 25);

  const businessIds = new Set<string>();
  const plaqueIds = new Set<string>();
  for (const e of events) {
    if (e.business_id) businessIds.add(e.business_id);
    if (e.plaque_id) plaqueIds.add(e.plaque_id);
  }
  for (const a of actions) {

    businessIds.add(a.business_id);
    if (a.plaque_id) plaqueIds.add(a.plaque_id);
  }

  const { data: bizRows } = businessIds.size
    ? await client.from("businesses").select("id, name").in("id", [...businessIds])
    : { data: [] };
  const { data: plaqueRows } = plaqueIds.size
    ? await client.from("plaques").select("id, plaque_code, plaque_name, placement_type").in("id", [...plaqueIds])
    : { data: [] };

  const bizName = new Map((bizRows ?? []).map((b) => [b.id, b.name]));
  const plaqueMap = new Map((plaqueRows ?? []).map((p) => [p.id, p]));

  const items = [
    ...(events ?? []).map((e) => ({
      kind: "event" as const,
      at: e.occurred_at,
      business: e.business_id ? (bizName.get(e.business_id) ?? "Unassigned") : "Unassigned",
      plaque: e.plaque_id ? (plaqueMap.get(e.plaque_id)?.plaque_name ?? plaqueMap.get(e.plaque_id)?.plaque_code ?? "") : "",
      placement: e.plaque_id ? (plaqueMap.get(e.plaque_id)?.placement_type ?? "") : "",
      label: e.source_type === "qr" ? "QR scan" : e.source_type === "nfc" ? "NFC tap" : e.event_type,
    })),
    ...(actions ?? []).map((a) => ({
      kind: "action" as const,
      at: a.created_at,
      business: bizName.get(a.business_id) ?? "Unassigned",
      plaque: a.plaque_id ? (plaqueMap.get(a.plaque_id)?.plaque_code ?? "") : "",
      placement: "",
      label: `${a.action_type.replace(/_/g, " ")} (${a.initiated_by})`,
    })),
  ]
    .sort((x, y) => (x.at < y.at ? 1 : -1))
    .slice(0, 30);

  return { ok: true as const, items };
});

/** Every business on the platform, with plaque counts and recent engagement. */
export const listAllBusinesses = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        query: z.string().max(120).default(""),
        filter: z
          .enum(["all", "active", "unclaimed", "no_owner", "has_plaques", "no_plaques", "recent"])
          .default("all"),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, businesses: [] };
    const client = await db();

    const { data: businesses } = await client
      .from("businesses")
      .select("id, name, industry, status, is_demo, created_at, updated_at")
      .eq("is_demo", false)
      .order("created_at", { ascending: false })
      .limit(500);


    const ids = (businesses ?? []).map((b) => b.id);
    if (!ids.length) return { ok: true as const, businesses: [] };

    const [{ data: plaques }, { data: locations }, { data: members }, { data: events }] = await Promise.all([
      client.from("plaques").select("id, business_id, status").in("business_id", ids),
      client
        .from("locations")
        .select("business_id, name, address, city, google_rating, google_review_count, google_place_id, phone")
        .in("business_id", ids),
      client.from("business_members").select("business_id, user_id, role").in("business_id", ids),
      client
        .from("events")
        .select("business_id, occurred_at, event_type")
        .in("business_id", ids)
        .gte("occurred_at", since(30))
        .limit(50000),
    ]);

    const rows = (businesses ?? []).map((b) => {
      const bizPlaques = (plaques ?? []).filter((p) => p.business_id === b.id);
      const loc = (locations ?? []).find((l) => l.business_id === b.id) ?? null;
      const bizEvents = (events ?? []).filter((e) => e.business_id === b.id && e.event_type === "interaction");
      const lastActivity = bizEvents.reduce<string | null>(
        (acc, e) => (!acc || e.occurred_at > acc ? e.occurred_at : acc),
        null,
      );
      return {
        id: b.id,
        name: b.name,
        industry: b.industry,
        status: b.status,
        isDemo: b.is_demo,
        createdAt: b.created_at,
        location: loc
          ? {
              name: loc.name,
              address: loc.address,
              city: loc.city,
              rating: loc.google_rating,
              reviews: loc.google_review_count,
              placeId: loc.google_place_id,
              phone: loc.phone,
            }
          : null,
        memberCount: (members ?? []).filter((m) => m.business_id === b.id).length,
        plaques: bizPlaques.length,
        activePlaques: bizPlaques.filter((p) => p.status === "active").length,
        interactions30: bizEvents.length,
        lastActivity: lastActivity ?? b.updated_at,
      };
    });

    const q = data.query.trim().toLowerCase();
    const searched = q
      ? rows.filter((r) =>
          [r.name, r.industry, r.location?.name, r.location?.address, r.location?.city, r.location?.placeId, r.location?.phone]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        )
      : rows;

    const filtered = searched.filter((r) => {
      switch (data.filter) {
        case "active":
          return r.status === "active";
        case "unclaimed":
          return r.memberCount === 0 && r.plaques > 0;
        case "no_owner":
          return r.memberCount === 0;
        case "has_plaques":
          return r.plaques > 0;
        case "no_plaques":
          return r.plaques === 0;
        case "recent":
          return r.createdAt >= since(30);
        default:
          return true;
      }
    });

    return { ok: true as const, businesses: filtered };
  });

/** Everything the platform owner needs about one customer business. */
export const getBusinessDetail = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ businessId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, detail: null };
    const client = await db();
    const b = data.businessId;

    const [{ data: business }, { data: locations }, { data: plaques }, { data: destinations }, { data: members }, { data: events }, { data: history }] =
      await Promise.all([
        client.from("businesses").select("*").eq("id", b).maybeSingle(),
        client.from("locations").select("*").eq("business_id", b),
        client
          .from("plaques")
          .select("id, plaque_code, public_slug, plaque_name, placement_type, product_type, status, activated_at, location_id")
          .eq("business_id", b),
        client
          .from("destinations")
          .select("id, plaque_id, destination_type, url, active, effective_from, effective_to")
          .eq("business_id", b)
          .order("effective_from", { ascending: false }),
        client.from("business_members").select("user_id, role, created_at").eq("business_id", b),
        client
          .from("events")
          .select("plaque_id, event_type, source_type, occurred_at")
          .eq("business_id", b)
          .gte("occurred_at", since(365))
          .limit(50000),
        client
          .from("action_history")
          .select("action_type, initiated_by, created_at, plaque_id")
          .eq("business_id", b)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

    // Demo businesses are never part of real operations.
    if (!business || business.is_demo) return { ok: true as const, detail: null };


    const { data: programming } = plaques?.length
      ? await client
          .from("plaque_programming")
          .select("plaque_id, write_status, verification_status")
          .in(
            "plaque_id",
            plaques.map((p) => p.id),
          )
      : { data: [] };

    // Member identities come from the auth admin API — never from a client query.
    const userIds = (members ?? []).map((m) => m.user_id);
    const identities: Record<string, { email: string | null; name: string | null }> = {};
    if (userIds.length) {
      const { data: profiles } = await client
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", userIds);
      const list = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const id of userIds) {
        const profile = (profiles ?? []).find((p) => p.user_id === id);
        identities[id] = {
          email: list.data.users.find((u) => u.id === id)?.email ?? null,
          name: profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null : null,
        };
      }
    }

    const interactions = (events ?? []).filter((e) => e.event_type === "interaction");
    const inWindow = (days: number) => interactions.filter((e) => e.occurred_at >= since(days)).length;

    return {
      ok: true as const,
      detail: {
        business,
        locations: locations ?? [],
        plaques: (plaques ?? []).map((p) => {
          const prog = (programming ?? []).find((x) => x.plaque_id === p.id) ?? null;
          const dest = (destinations ?? []).find((d) => d.plaque_id === p.id && d.effective_to === null) ?? null;
          return {
            ...p,
            writeStatus: prog?.write_status ?? "not_started",
            verificationStatus: prog?.verification_status ?? "unverified",
            destination: dest ? { type: dest.destination_type, url: dest.url } : null,
            interactions30: interactions.filter((e) => e.plaque_id === p.id && e.occurred_at >= since(30)).length,
          };
        }),
        destinations: destinations ?? [],
        members: (members ?? []).map((m) => ({
          userId: m.user_id,
          role: m.role,
          joinedAt: m.created_at,
          email: identities[m.user_id]?.email ?? null,
          name: identities[m.user_id]?.name ?? null,
        })),
        performance: {
          today: interactions.filter((e) => e.occurred_at >= startOfToday()).length,
          days7: inWindow(7),
          days30: inWindow(30),
          allTime: interactions.length,
          nfc: interactions.filter((e) => e.source_type === "nfc").length,
          qr: interactions.filter((e) => e.source_type === "qr").length,
        },
        history: history ?? [],
      },
    };
  });

/** Everyone with a TapLocal account, and what they can reach. */
export const listCustomers = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ query: z.string().max(120).default("") }).parse(data ?? {}))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, customers: [] };
    const client = await db();

    const list = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const { data: profiles } = await client.from("profiles").select("user_id, first_name, last_name, phone, created_at");
    const scope = await scopeFor(client);
    const { data: allMembers } = await client.from("business_members").select("user_id, business_id, role");
    const members = (allMembers ?? []).filter((m) => !scope.demoBusinessIds.has(m.business_id));
    const bizIds = [...new Set(members.map((m) => m.business_id))];
    const { data: businesses } = bizIds.length
      ? await client.from("businesses").select("id, name").in("id", bizIds)
      : { data: [] };
    const bizName = new Map((businesses ?? []).map((x) => [x.id, x.name]));


    const rows = list.data.users.map((u) => {
      const profile = (profiles ?? []).find((p) => p.user_id === u.id);
      return {
        userId: u.id,
        email: u.email ?? null,
        name: profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || null : null,
        phone: profile?.phone ?? null,
        joinedAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        memberships: (members ?? [])
          .filter((m) => m.user_id === u.id)
          .map((m) => ({ businessId: m.business_id, businessName: bizName.get(m.business_id) ?? "Unknown", role: m.role })),
      };
    });

    const q = data.query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => [r.email, r.name, r.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      : rows;

    return { ok: true as const, customers: filtered };
  });

/** Master plaque inventory with assignment, programming and usage. */
export const listAllPlaques = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ query: z.string().max(120).default(""), status: z.string().max(40).default("all") }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, plaques: [] };
    const client = await db();

    let request = client
      .from("plaques")
      .select(
        "id, plaque_code, public_slug, plaque_name, placement_type, product_type, style, base_type, batch_id, status, business_id, location_id, activated_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    const q = data.query.trim();
    if (q) request = request.or(`plaque_code.ilike.%${q}%,public_slug.ilike.%${q}%,batch_id.ilike.%${q}%,plaque_name.ilike.%${q}%`);
    if (data.status !== "all") request = request.eq("status", data.status as never);

    const scope = await scopeFor(client);
    const { data: allRows } = await request;
    const plaques = (allRows ?? []).filter((p) => !p.business_id || !scope.demoBusinessIds.has(p.business_id));
    const ids = plaques.map((p) => p.id);
    if (!ids.length) return { ok: true as const, plaques: [] };


    const [{ data: programming }, { data: events }, { data: destinations }, { data: businesses }, { data: locations }] =
      await Promise.all([
        client.from("plaque_programming").select("plaque_id, write_status, verification_status").in("plaque_id", ids),
        client
          .from("events")
          .select("plaque_id, event_type, occurred_at")
          .in("plaque_id", ids)
          .gte("occurred_at", since(30))
          .limit(50000),
        client.from("destinations").select("plaque_id, destination_type, url, effective_to").in("plaque_id", ids),
        client.from("businesses").select("id, name"),
        client.from("locations").select("id, name"),
      ]);

    const bizName = new Map((businesses ?? []).map((b) => [b.id, b.name]));
    const locName = new Map((locations ?? []).map((l) => [l.id, l.name]));
    const today = startOfToday();

    return {
      ok: true as const,
      plaques: (plaques ?? []).map((p) => {
        const ev = (events ?? []).filter((e) => e.plaque_id === p.id && e.event_type === "interaction");
        const prog = (programming ?? []).find((x) => x.plaque_id === p.id) ?? null;
        const dest = (destinations ?? []).find((d) => d.plaque_id === p.id && d.effective_to === null) ?? null;
        return {
          ...p,
          businessName: p.business_id ? (bizName.get(p.business_id) ?? null) : null,
          locationName: p.location_id ? (locName.get(p.location_id) ?? null) : null,
          writeStatus: prog?.write_status ?? "not_started",
          verificationStatus: prog?.verification_status ?? "unverified",
          destinationType: dest?.destination_type ?? null,
          destinationUrl: dest?.url ?? null,
          interactionsToday: ev.filter((e) => e.occurred_at >= today).length,
          interactions30: ev.length,
          lastInteraction: ev.reduce<string | null>((acc, e) => (!acc || e.occurred_at > acc ? e.occurred_at : acc), null),
        };
      }),
    };
  });

/** Full platform record for a single plaque. */
export const getPlaqueRecord = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ plaqueId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, record: null };
    const client = await db();
    const id = data.plaqueId;

    const scope = await scopeFor(client);
    const { data: plaque } = await client.from("plaques").select("*").eq("id", id).maybeSingle();
    if (!plaque || (plaque.business_id && scope.demoBusinessIds.has(plaque.business_id)))
      return { ok: true as const, record: null };


    const [{ data: programming }, { data: destinations }, { data: events }, { data: placements }, { data: progEvents }] =
      await Promise.all([
        client.from("plaque_programming").select("*").eq("plaque_id", id).maybeSingle(),
        client.from("destinations").select("*").eq("plaque_id", id).order("effective_from", { ascending: false }),
        client.from("events").select("event_type, source_type, occurred_at").eq("plaque_id", id).limit(50000),
        client.from("plaque_placement_history").select("*").eq("plaque_id", id).order("effective_from", { ascending: false }),
        client
          .from("programming_events")
          .select("event_type, result, created_at")
          .eq("plaque_id", id)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

    const business = plaque.business_id
      ? (await client.from("businesses").select("id, name").eq("id", plaque.business_id).maybeSingle()).data
      : null;
    const location = plaque.location_id
      ? (await client.from("locations").select("id, name, city").eq("id", plaque.location_id).maybeSingle()).data
      : null;

    const interactions = (events ?? []).filter((e) => e.event_type === "interaction");
    const inWindow = (days: number) => interactions.filter((e) => e.occurred_at >= since(days)).length;

    return {
      ok: true as const,
      record: {
        plaque: {
          id: plaque.id,
          plaqueCode: plaque.plaque_code,
          publicSlug: plaque.public_slug,
          status: plaque.status,
          productType: plaque.product_type,
          style: plaque.style,
          baseType: plaque.base_type,
          batchId: plaque.batch_id,
          plaqueName: plaque.plaque_name,
          placementType: plaque.placement_type,
          activatedAt: plaque.activated_at,
          claimedAt: plaque.claimed_at,
          configuredAt: plaque.configured_at,
          hasActivationCode: Boolean(plaque.activation_token_hash),
        },
        business,
        location,
        programming: programming ?? null,
        destinations: destinations ?? [],
        placements: placements ?? [],
        programmingEvents: progEvents ?? [],
        performance: {
          today: interactions.filter((e) => e.occurred_at >= startOfToday()).length,
          days7: inWindow(7),
          days30: inWindow(30),
          allTime: interactions.length,
          nfc: interactions.filter((e) => e.source_type === "nfc").length,
          qr: interactions.filter((e) => e.source_type === "qr").length,
          lastInteraction: interactions.reduce<string | null>(
            (acc, e) => (!acc || e.occurred_at > acc ? e.occurred_at : acc),
            null,
          ),
        },
      },
    };
  });

/** Network-wide performance for the admin analytics screen. */
export const networkAnalytics = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(data ?? {}))
  .handler(async ({ data }) => {
    const caller = await gate();
    if (!caller.ok) return { ok: false as const, error: caller.error, analytics: null };
    const client = await db();

    const [{ data: events }, { data: plaques }, { data: businesses }] = await Promise.all([
      client
        .from("events")
        .select("business_id, plaque_id, event_type, source_type, destination_type, occurred_at")
        .gte("occurred_at", since(data.days))
        .limit(100000),
      client.from("plaques").select("id, plaque_code, plaque_name, placement_type, business_id, status"),
      client.from("businesses").select("id, name"),
    ]);

    const interactions = (events ?? []).filter((e) => e.event_type === "interaction");
    const bizName = new Map((businesses ?? []).map((b) => [b.id, b.name]));
    const plaqueMap = new Map((plaques ?? []).map((p) => [p.id, p]));

    const tally = <T extends string>(list: (T | null)[]) => {
      const out: Record<string, number> = {};
      for (const key of list) if (key) out[key] = (out[key] ?? 0) + 1;
      return Object.entries(out).sort((a, b) => b[1] - a[1]);
    };

    const perPlaque: Record<string, number> = {};
    for (const e of interactions) if (e.plaque_id) perPlaque[e.plaque_id] = (perPlaque[e.plaque_id] ?? 0) + 1;

    const perDay: Record<string, number> = {};
    for (const e of interactions) {
      const day = e.occurred_at.slice(0, 10);
      perDay[day] = (perDay[day] ?? 0) + 1;
    }

    const perBusiness: Record<string, number> = {};
    for (const e of interactions) if (e.business_id) perBusiness[e.business_id] = (perBusiness[e.business_id] ?? 0) + 1;

    const livePlaques = (plaques ?? []).filter((p) => p.status === "active");

    return {
      ok: true as const,
      analytics: {
        days: data.days,
        total: interactions.length,
        nfc: interactions.filter((e) => e.source_type === "nfc").length,
        qr: interactions.filter((e) => e.source_type === "qr").length,
        perDay: Object.entries(perDay).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
        placements: tally(interactions.map((e) => (e.plaque_id ? (plaqueMap.get(e.plaque_id)?.placement_type ?? null) : null))),
        destinations: tally(interactions.map((e) => e.destination_type)),
        topPlaques: Object.entries(perPlaque)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([id, count]) => ({
            id,
            label: plaqueMap.get(id)?.plaque_name ?? plaqueMap.get(id)?.plaque_code ?? "Plaque",
            business: plaqueMap.get(id)?.business_id ? (bizName.get(plaqueMap.get(id)!.business_id!) ?? "") : "",
            count,
          })),
        topBusinesses: Object.entries(perBusiness)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([id, count]) => ({ id, name: bizName.get(id) ?? "Unknown", count })),
        silentPlaques: livePlaques
          .filter((p) => !perPlaque[p.id])
          .slice(0, 20)
          .map((p) => ({
            id: p.id,
            label: p.plaque_name ?? p.plaque_code,
            business: p.business_id ? (bizName.get(p.business_id) ?? "") : "",
          })),
      },
    };
  });

export type AdminDenied = Denied;
