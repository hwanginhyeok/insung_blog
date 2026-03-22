"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchNeighborStats,
  fetchNeighborList,
  fetchNeighborRequests,
  fetchInteractions,
  fetchRecommendations,
  type Neighbor,
  type NeighborRequest,
  type NeighborInteraction,
  type NeighborRecommendation,
  type NeighborStats,
} from "../_lib/neighbor-api";

export function useNeighborData() {
  const [stats, setStats] = useState<NeighborStats | null>(null);
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [requests, setRequests] = useState<NeighborRequest[]>([]);
  const [interactions, setInteractions] = useState<NeighborInteraction[]>([]);
  const [recommendations, setRecommendations] = useState<NeighborRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [s, n, r, i, rec] = await Promise.all([
      fetchNeighborStats(),
      fetchNeighborList(),
      fetchNeighborRequests(),
      fetchInteractions(),
      fetchRecommendations(),
    ]);
    setStats(s);
    setNeighbors(n);
    setRequests(r);
    setInteractions(i);
    setRecommendations(rec);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return {
    stats,
    neighbors,
    requests,
    interactions,
    recommendations,
    loading,
    refresh: loadAll,
    setNeighbors,
    setRequests,
    setRecommendations,
  };
}
