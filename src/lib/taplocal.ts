import { supabase } from "@/integrations/supabase/client";

export const DEMO_BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

export type IntentKey =
  | "review"
  | "social"
  | "menu"
  | "booking"
  | "lead"
  | "directions"
  | "website"
  | "promotion"
  | "loyalty"
  | "custom";

export const INTENT_LABEL: Record<string, string> = {
  review: "Reviews",
  social: "Instagram",
  menu: "Menu",
  booking: "Bookings",
  lead: "Leads",
  directions: "Directions",
  website: "Website",
  promotion: "Offers",
  loyalty: "Loyalty",
  custom: "Custom",
};

export const DESTINATION_LABEL: Record<string, string> = {
  google_review: "Google Reviews",
  instagram: "Instagram",
  facebook: "Facebook",
  website: "Website",
  menu: "Menu",
  booking: "Booking",
  directions: "Directions",
  call: "Phone Call",
  quote: "Request a Quote",
  coupon: "Offer",
  loyalty: "Loyalty",
  custom: "Custom Link",
};

export const PLACEMENT_LABEL: Record<string, string> = {
  front_counter: "Front Counter",
  checkout: "Checkout",
  table: "Table",
  reception: "Reception",
  entrance: "Entrance",
  exit: "Exit",
  bar: "Bar",
  waiting_area: "Waiting Area",
  hotel_room: "Hotel Room",
  vehicle: "Vehicle",
  other: "Other",
};

export type PlaqueRow = {
  id: string;
  plaque_code: string;
  public_slug: string;
  plaque_name: string | null;
  placement_type: string | null;
  product_type: string;
  status: string;
  activated_at: string | null;
  business_id: string | null;
  location_id: string | null;
};

export type DestinationRow = {
  id: string;
  plaque_id: string | null;
  destination_type: string;
  url: string;
  active: boolean;
  effective_from: string;
  effective_to: string | null;
};

export type EventRow = {
  plaque_id: string | null;
  event_type: string;
  source_type: string | null;
  intent_type: string | null;
  destination_type: string | null;
  anonymous_visitor_key: string | null;
  occurred_at: string;
};

/**
 * Resolves the business the signed-in user manages. Returns null when nobody is
 * signed in — the sample business is only used in explicit demo mode.
 */
export async function resolveBusinessId(): Promise<string | null> {
  const { data: session } = await supabase.auth.getSession();
  if (session.session) {
    const { data } = await supabase
      .from("business_members")
      .select("business_id")
      .eq("user_id", session.session.user.id)
      .order("created_at", { ascending: true })
      .limit(1);
    if (data && data[0]) return data[0].business_id;
  }
  if (isDemoMode()) return DEMO_BUSINESS_ID;
  return null;
}

/** Every business the signed-in user belongs to (for the header switcher). */
export async function fetchMyBusinesses() {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    if (!isDemoMode()) return [];
    const demo = await fetchBusiness(DEMO_BUSINESS_ID);
    return demo ? [demo] : [];
  }
  const { data: members } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", session.session.user.id);
  const ids = (members ?? []).map((m) => m.business_id);
  if (!ids.length) return [];
  const { data } = await supabase.from("businesses").select("*").in("id", ids);
  return data ?? [];
}

export async function fetchBusiness(businessId: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchPlaques(businessId: string) {
  const { data, error } = await supabase
    .from("plaques")
    .select(
      "id, plaque_code, public_slug, plaque_name, placement_type, product_type, status, activated_at, business_id, location_id",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlaqueRow[];
}

export async function fetchDestinations(businessId: string) {
  const { data, error } = await supabase
    .from("destinations")
    .select("id, plaque_id, destination_type, url, active, effective_from, effective_to")
    .eq("business_id", businessId)
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DestinationRow[];
}

export async function fetchEvents(businessId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from("events")
    .select(
      "plaque_id, event_type, source_type, intent_type, destination_type, anonymous_visitor_key, occurred_at",
    )
    .eq("business_id", businessId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .range(0, 9999);
  if (error) throw error;
  return (data ?? []) as EventRow[];
}

export async function fetchRecommendations(businessId: string) {
  const { data, error } = await supabase
    .from("recommendations")
    .select("*")
    .eq("business_id", businessId)
    .in("status", ["new", "viewed"])
    .order("confidence", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchSnapshots(businessId: string) {
  const { data, error } = await supabase
    .from("metric_snapshots")
    .select("metric_type, metric_value, captured_at")
    .eq("business_id", businessId)
    .order("captured_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchOutcomes(businessId: string) {
  const { data, error } = await supabase
    .from("outcomes")
    .select("outcome_type, attribution_type, value, occurred_at")
    .eq("business_id", businessId);
  if (error) throw error;
  return data ?? [];
}

export async function fetchActionHistory(businessId: string) {
  const { data, error } = await supabase
    .from("action_history")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function fetchPlacementHistory(plaqueId: string) {
  const { data, error } = await supabase
    .from("plaque_placement_history")
    .select("*")
    .eq("plaque_id", plaqueId)
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
