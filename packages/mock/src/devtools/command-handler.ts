import { seedAllCollections } from "../auto/auto-scenario";
import type { NetworkState } from "../network/state";
import type {
  FaultWeight,
  LatencyProfile,
  NetworkConfig,
  RouteNetworkOverride,
  StopCondition,
} from "../types";
import type { MockEventEmitter } from "./event-emitter";
import type {
  BridgeContext,
  MockChaosSetCommand,
  MockCommand,
  MockNetworkSetCommand,
} from "./types";

interface Socket {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

type CommandCallback = (result: { ok: boolean; error?: string; data?: unknown }) => void;

/** Actions that mutate store data and require a snapshot push */
const STORE_MUTATIONS = new Set([
  "mock:store:create",
  "mock:store:update",
  "mock:store:delete",
  "mock:store:seed",
  "mock:server:reset",
]);

/**
 * Listen for mock:command events from DevTools UI and dispatch to server.
 * Returns a cleanup function.
 */
export function createCommandHandler(
  socket: Socket,
  ctx: BridgeContext,
  emitter: MockEventEmitter,
): () => void {
  const handler = async (command: unknown, callback?: unknown) => {
    const cmd = command as MockCommand;
    const cb = typeof callback === "function" ? (callback as CommandCallback) : undefined;

    if (cmd.serverId !== ctx.serverId) return;

    try {
      const result = await dispatchCommand(ctx, emitter, cmd);
      cb?.({ ok: true, data: result });

      if (STORE_MUTATIONS.has(cmd.action)) emitter.emitStoreSnapshot();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      cb?.({ ok: false, error: message });
    }
  };

  socket.on("mock:command", handler);
  return () => socket.off("mock:command", handler);
}

async function dispatchCommand(
  ctx: BridgeContext,
  emitter: MockEventEmitter,
  cmd: MockCommand,
): Promise<unknown> {
  switch (cmd.action) {
    case "mock:store:create":
      return handleStoreCreate(ctx, cmd.collection, cmd.record);
    case "mock:store:update":
      return handleStoreUpdate(ctx, cmd.collection, cmd.id, cmd.data);
    case "mock:store:delete":
      return handleStoreDelete(ctx, cmd.collection, cmd.id);
    case "mock:store:seed":
      return handleStoreSeed(ctx, cmd.collection, cmd.count);
    case "mock:scenario:apply":
      return handleScenarioApply(ctx, emitter, cmd.scenario);
    case "mock:network:set":
      return handleNetworkSet(ctx, emitter, cmd);
    case "mock:chaos:set":
      return handleChaosSet(ctx, emitter, cmd);
    case "mock:server:reset":
      return handleServerReset(ctx, emitter);
    default:
      throw new Error(`Unknown command: ${(cmd as { action: string }).action}`);
  }
}

function handleStoreCreate(
  ctx: BridgeContext,
  collectionName: string,
  record: Record<string, unknown>,
): unknown {
  const col = ctx.server.store.collection(collectionName);
  return col.create(record);
}

function handleStoreUpdate(
  ctx: BridgeContext,
  collectionName: string,
  id: string | number,
  data: Record<string, unknown>,
): unknown {
  const col = ctx.server.store.collection(collectionName);
  return col.update((q) => q.where({ id } as Record<string, unknown>), { data });
}

function handleStoreDelete(
  ctx: BridgeContext,
  collectionName: string,
  rawId: string | number,
): boolean {
  const col = ctx.server.store.collection(collectionName);
  if (rawId === "*") {
    col.clear();
    return true;
  }
  const id = parseId(rawId);
  return col.delete((q) => q.where({ id } as Record<string, unknown>));
}

function parseId(raw: string | number): string | number {
  if (typeof raw === "number") return raw;
  const num = Number(raw);
  return Number.isNaN(num) ? raw : num;
}

function handleStoreSeed(
  ctx: BridgeContext,
  _collectionName: string,
  count: number,
): { seeded: number } {
  seedAllCollections(ctx.analyzedRoutes, ctx.server.store, { seedCount: count });
  return { seeded: count };
}

async function handleScenarioApply(
  ctx: BridgeContext,
  emitter: MockEventEmitter,
  scenarioName: string,
): Promise<{ applied: string }> {
  const url = `${ctx.url}/__admin/scenarios/${encodeURIComponent(scenarioName)}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to apply scenario "${scenarioName}"`);
  ctx.activeScenario = scenarioName;
  emitter.emitScenarioActive(scenarioName);
  return { applied: scenarioName };
}

/** Apply latency + bandwidth config from the Latency Controls panel */
function handleNetworkSet(
  ctx: BridgeContext,
  emitter: MockEventEmitter,
  cmd: MockNetworkSetCommand,
): { updated: boolean } {
  const state = ctx.server.networkState;
  const prevLatencyPreset = state.latencyPreset;
  const raw = cmd.config;

  const patch: Partial<NetworkConfig> = {
    latency: normalizeLatency(raw.latency),
    bandwidth: raw.bandwidth,
    distribution:
      raw.latency && typeof raw.latency === "object" && "distribution" in raw.latency
        ? (raw.latency.distribution as NetworkConfig["distribution"])
        : undefined,
    routeOverrides: raw.routeOverrides as RouteNetworkOverride[] | undefined,
    stopConditions: raw.stopConditions as StopCondition | undefined,
  };

  const rawAny = raw as Record<string, unknown>;
  if (rawAny.errorRate !== undefined) patch.errorRate = rawAny.errorRate as number;
  if (rawAny.faultWeights !== undefined) patch.faultWeights = rawAny.faultWeights as FaultWeight[];

  state.mergeConfig(patch);

  if (cmd.preset !== undefined) {
    const hasLatency = patch.latency !== undefined;
    const hasChaos = patch.errorRate !== undefined;
    if (hasLatency) {
      state.latencyPreset = cmd.preset;
      state.latencyStartedAt = cmd.preset === "none" ? null : Date.now();
    }
    if (hasChaos) {
      state.chaosPreset = (patch.errorRate ?? 0) > 0 ? cmd.preset : "none";
      state.chaosStartedAt = (patch.errorRate ?? 0) > 0 ? Date.now() : null;
    }
  }

  state.resetMetrics();
  emitPresetTransition(emitter, ctx.serverId, prevLatencyPreset, state.latencyPreset);
  emitter.emitNetworkConfig(serializeConfig(state));
  return { updated: true };
}

/** Apply chaos/error config from the Chaos Controls panel */
function handleChaosSet(
  ctx: BridgeContext,
  emitter: MockEventEmitter,
  cmd: MockChaosSetCommand,
): { updated: boolean } {
  const state = ctx.server.networkState;
  const prevChaosPreset = state.chaosPreset;
  const raw = cmd.config;

  state.mergeConfig({
    errorRate: raw.errorRate,
    faultWeights: raw.faultWeights as FaultWeight[] | undefined,
    stopConditions: raw.stopConditions as StopCondition | undefined,
  });

  if (cmd.preset !== undefined) {
    state.chaosPreset = (raw.errorRate ?? 0) > 0 ? cmd.preset : "none";
    state.chaosStartedAt = (raw.errorRate ?? 0) > 0 ? Date.now() : null;
  }

  state.resetMetrics();
  emitPresetTransition(emitter, ctx.serverId, prevChaosPreset, state.chaosPreset);
  emitter.emitNetworkConfig(serializeConfig(state));
  return { updated: true };
}

function handleServerReset(ctx: BridgeContext, emitter: MockEventEmitter): { reset: boolean } {
  ctx.server.store.reset();
  ctx.reseed?.();
  ctx.server.history.length = 0;
  ctx.requestCounter = 0;
  ctx.server.networkState.setConfig(undefined);
  emitter.emitNetworkConfig(serializeConfig(ctx.server.networkState));
  return { reset: true };
}

/** Normalize latency from command payload to a LatencyProfile-compatible shape */
function normalizeLatency(
  raw?: number | string | { min: number; max: number; jitter?: number; distribution?: string },
): LatencyProfile | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number") {
    return raw === 0 ? undefined : { min: raw, max: raw };
  }
  if (typeof raw === "string") {
    return raw as LatencyProfile;
  }
  if (raw.min === 0 && raw.max === 0) return undefined;
  return { min: raw.min, max: raw.max, jitter: raw.jitter };
}

/** Compare prev/next preset names and emit appropriate experiment events */
function emitPresetTransition(
  emitter: MockEventEmitter,
  serverId: string,
  prev: string,
  next: string,
): void {
  if (prev === next) return;
  const OFF = new Set(["none", "stable", ""]);
  const wasActive = !OFF.has(prev);
  const isActive = !OFF.has(next);

  if (wasActive) {
    emitter.emitExperimentEvent({ eventType: "stopped", serverId, mode: prev, errorRate: 0 });
  }
  if (isActive) {
    emitter.emitExperimentEvent({ eventType: "started", serverId, mode: next, errorRate: 0 });
  }
}

/** Serialize the current network state into a payload for the UI */
function serializeConfig(state: NetworkState): Record<string, unknown> {
  const cfg = state.getGlobalConfig();
  return {
    latency: cfg?.latency ?? 0,
    errorRate: cfg?.errorRate ?? 0,
    faultWeights: cfg?.faultWeights ?? [],
    bandwidth: cfg?.bandwidth ?? 0,
    distribution: cfg?.distribution ?? "uniform",
    routeOverrides: cfg?.routeOverrides ?? [],
    stopConditions: cfg?.stopConditions ?? null,
    startedAt: state.startedAt,
    latencyPreset: state.latencyPreset,
    latencyStartedAt: state.latencyStartedAt,
    chaosPreset: state.chaosPreset,
    chaosStartedAt: state.chaosStartedAt,
  };
}
