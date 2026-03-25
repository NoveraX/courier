import { useMemo, useCallback } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";

import { useStudioStore } from "@/store";

import type { MiddlewareMode } from "./types";
import type { MiddlewareSearchParams } from "./search-schema";
import {
  computeAggregateStats,
  buildChain,
  computeOverheadStats,
  filterWithMiddleware,
} from "./helpers";
import {
  executionSparkline,
  overheadSparkline,
  p95Sparkline,
  computeEndpointImpact,
} from "./compute-insights";

export function useMiddleware() {
  const requests = useStudioStore((s) => s.requests);
  const params = useSearch({ from: "/middleware" }) as MiddlewareSearchParams;
  const navigate = useNavigate({ from: "/middleware" });

  const mode: MiddlewareMode = (params.mode as MiddlewareMode) ?? "aggregate";
  const selectedRequestId = params.selectedRequestId;

  const updateUrl = useCallback(
    (next: Partial<MiddlewareSearchParams>) => {
      navigate({
        search: (prev: MiddlewareSearchParams) => {
          const merged = { ...prev, ...next };
          const clean: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(merged)) {
            if (v !== undefined && v !== "" && v !== "aggregate") clean[k] = v;
          }
          return clean;
        },
        replace: true,
      });
    },
    [navigate],
  );

  const withMiddleware = useMemo(() => filterWithMiddleware(requests), [requests]);
  const aggregateStats = useMemo(() => computeAggregateStats(withMiddleware), [withMiddleware]);
  const overheadStats = useMemo(() => computeOverheadStats(withMiddleware), [withMiddleware]);

  // Sparklines
  const execSpark = useMemo(() => executionSparkline(withMiddleware), [withMiddleware]);
  const overheadSpark = useMemo(() => overheadSparkline(withMiddleware), [withMiddleware]);
  const p95Spark = useMemo(() => p95Sparkline(withMiddleware), [withMiddleware]);

  // Endpoint impact
  const endpointImpact = useMemo(() => computeEndpointImpact(withMiddleware), [withMiddleware]);

  const selectedRequest = useMemo(
    () => (selectedRequestId ? withMiddleware.find((r) => r.id === selectedRequestId) ?? null : null),
    [withMiddleware, selectedRequestId],
  );

  const selectedChain = useMemo(
    () => (selectedRequest ? buildChain(selectedRequest) : null),
    [selectedRequest],
  );

  // Actions
  const setMode = useCallback(
    (m: MiddlewareMode) => updateUrl({ mode: m, selectedRequestId: undefined }),
    [updateUrl],
  );
  const setSelectedRequest = useCallback(
    (id: string | undefined) => updateUrl({ selectedRequestId: id }),
    [updateUrl],
  );

  return {
    mode,
    requests: withMiddleware,
    aggregateStats,
    overheadStats,
    execSparkline: execSpark,
    overheadSparkline: overheadSpark,
    p95Sparkline: p95Spark,
    endpointImpact,
    selectedRequestId,
    selectedRequest,
    selectedChain,
    setMode,
    setSelectedRequest,
    totalRequests: requests.length,
  };
}
