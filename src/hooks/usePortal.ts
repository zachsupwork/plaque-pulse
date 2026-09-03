import { useQuery } from "@tanstack/react-query";
import {
  fetchActionHistory,
  fetchBusiness,
  fetchDestinations,
  fetchEvents,
  fetchOutcomes,
  fetchPlaques,
  fetchRecommendations,
  fetchSnapshots,
  resolveBusinessId,
} from "@/lib/taplocal";

export function useBusinessId() {
  return useQuery({ queryKey: ["business-id"], queryFn: resolveBusinessId, staleTime: 5 * 60_000 });
}

export function usePortal() {
  const { data: businessId } = useBusinessId();
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
    businessId,
    business: business.data ?? null,
    plaques: plaques.data ?? [],
    destinations: destinations.data ?? [],
    events: events.data ?? [],
    recommendations: recommendations.data ?? [],
    isLoading: business.isLoading || plaques.isLoading || events.isLoading,
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
