/**
 * Mock Zustand slice — public entry point.
 *
 * Re-exports all data shapes from `mock-slice-types.ts`, builds the store
 * from the action factory in `mock-slice-actions.ts`, and exposes the
 * selector hooks consumed by the views. Callers
 * `import { useMockStore, useActiveServer, MockServerInfo, ... } from "./mock-slice"`.
 */

import { useMemo } from "react";
import { create } from "zustand";
import { mockServerOf } from "./mock-server-of";

import { createMockSliceActions } from "./mock-slice-actions";
import type { MockServerInfo, MockSliceState } from "./mock-slice-types";

export type {
  ChaosPreset,
  ExperimentEvent,
  FaultWeight,
  LatencyDistribution,
  LatencyPreset,
  NetworkConfig,
  NetworkPreset,
  RouteOverride,
  SavedScenario,
  StopCondition,
} from "./mock-slice-network-types";
export type {
  MockCollectionEntry,
  MockRequestLog,
  MockRouteEntry,
  MockScenarioEndpoint,
  MockScenarioEntry,
  MockServerInfo,
  MockSliceState,
  ProcessStatus,
  StateTransition,
} from "./mock-slice-types";

export const useMockStore = create<MockSliceState>((set, get) => ({
  servers: {},
  activeServerId: null,
  logs: [],
  logsPaused: false,
  experimentHistory: [],
  ...createMockSliceActions(set, get),
}));

// ── Selectors ─────────────────────────────────────────────────────────────────

export function useActiveServer(): MockServerInfo | undefined {
  const activeServerId = useMockStore((s) => s.activeServerId);
  const servers = useMockStore((s) => s.servers);
  return activeServerId ? mockServerOf(servers, activeServerId) : undefined;
}

export function useServerCount(): number {
  return useMockStore((s) => Object.keys(s.servers).length);
}

export function useAllServers(): MockServerInfo[] {
  const servers = useMockStore((s) => s.servers);
  return useMemo(() => Object.values(servers), [servers]);
}
