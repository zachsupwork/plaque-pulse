import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchActionHistory,
  fetchBusiness,
  fetchDestinations,
  fetchEvents,
  fetchMyBusinesses,
  fetchLocations,
  fetchOutcomes,
  fetchPlaques,
  fetchRecommendations,
  fetchSnapshots,
  resolveBusinessId,
  DEMO_BUSINESS_ID,
} from "@/lib/taplocal";
import { isDemoMode } from "@/lib/demo";

export function useBusinessId() {
  return useQuery({ queryKey: ["business-id"], queryFn: resolveBusinessId, staleTime: 5 * 60_000 });
}

/** Hydration-safe read of demo mode. */
export function useIsDemo() {
  const [demo, setDemo] = useState(false);
  useEffect(() => setDemo(isDemoMode()), []);
  const { data: businessId } = useBusinessId();
  return demo || businessId === DEMO_BUSINESS_ID;
}

export function useMyBusinesses() {
  return useQuery({ queryKey: ["my-businesses"], queryFn: fetchMyBusinesses, staleTime: 5 * 60_000 });
}

export function usePortal() {
  const { data: businessId, isPending: resolving } = useBusinessId();
  const enabled = Boolean(businessId);

  const business = useQuery({
    queryKey: ["business", businessId],
    queryFn: () => fetchBusiness(businessId!),
    enabled,
  });
  const plaques = useQuery({
    queryKey: ["plaques", businessId],
    queryFn: () => fetchPlaques(businessId!),
    enabled,
  });
  const destinations = useQuery({
    queryKey: ["destinations", businessId],
    queryFn: () => fetchDestinations(businessId!),
    enabled,
  });
  const events = useQuery({
    queryKey: ["events", businessId],
    queryFn: () => fetchEvents(businessId!, 30),
    enabled,
  });
  const recommendations = useQuery({
    queryKey: ["recommendations", businessId],
    queryFn: () => fetchRecommendations(businessId!),
    enabled,
  });

  return {
    businessId: businessId ?? null,
    resolving,
    business: business.data ?? null,
    plaques: plaques.data ?? [],
    destinations: destinations.data ?? [],
    events: events.data ?? [],
    recommendations: recommendations.data ?? [],
    isLoading: resolving || business.isLoading || plaques.isLoading || events.isLoading,
  };
}

export function useSnapshots() {
  const { data: businessId } = useBusinessId();
  return useQuery({
    queryKey: ["snapshots", businessId],
    queryFn: () => fetchSnapshots(businessId!),
    enabled: Boolean(businessId),
  });
}

export function useOutcomes() {
  const { data: businessId } = useBusinessId();
  return useQuery({
    queryKey: ["outcomes", businessId],
    queryFn: () => fetchOutcomes(businessId!),
    enabled: Boolean(businessId),
  });
}

export function useActionHistory() {
  const { data: businessId } = useBusinessId();
  return useQuery({
    queryKey: ["action-history", businessId],
    queryFn: () => fetchActionHistory(businessId!),
    enabled: Boolean(businessId),
  });
}

/** Active destination for a plaque at this moment. */
export function activeDestination<T extends { plaque_id: string | null; active: boolean; effective_to: string | null }>(
  destinations: T[],
  plaqueId: string,
): T | undefined {
  return destinations.find((d) => d.plaque_id === plaqueId && d.active && d.effective_to === null);
}

export function useLocations() {
  const { data: businessId } = useBusinessId();
  return useQuery({
    queryKey: ["locations", businessId],
    queryFn: () => fetchLocations(businessId!),
    enabled: Boolean(businessId),
  });
}
