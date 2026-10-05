import type { ChaosFormValues, ChaosMode } from "@/features/mocks/chaos-config";
import { DEFAULT_STOP } from "@/features/mocks/chaos-config";
import { LATENCY_DEFAULTS } from "@/features/mocks/latency-config";
import { routeOverridesOf } from "@/features/mocks/route-overrides";
import { getSocket } from "@/socket";
import type {
  LatencyPreset,
  MockServerInfo,
  NetworkConfig,
  RouteOverride,
  StopCondition,
} from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";

function send(serverId: string, action: string, payload: Record<string, unknown>): void {
  getSocket().emit("mock:command", { action, serverId, ...payload });
}

/* The mock's own echo replaces this; until it comes, the page shows what was sent. */
function configWith(server: MockServerInfo, patch: Partial<NetworkConfig>): NetworkConfig {
  return { latency: 0, errorRate: 0, ...server.networkConfig, ...patch };
}

/**
 * Fail a share of the mock's answers: a preset's rate and mix or one's
 * own, with the stop conditions in force. A rate of 0 is no chaos.
 *
 * @param server - The mock server
 * @param mode - The preset, or `custom`
 * @param values - The rate in percent and the mix of faults
 * @param stop - The thresholds that halt it on their own
 * @example
 * ```ts
 * setChaos(server, "degraded", PRESET_CONFIG.degraded);
 * ```
 */
export function setChaos(
  server: MockServerInfo,
  mode: ChaosMode,
  values: ChaosFormValues,
  stop: StopCondition = server.stopConditions ?? DEFAULT_STOP,
): void {
  const preset = values.errorRate === 0 || mode === "stable" ? "none" : mode;
  const config = {
    errorRate: preset === "none" ? 0 : values.errorRate / 100,
    faultWeights: preset === "none" ? [] : values.faultWeights,
    stopConditions: stop,
  };
  useMockStore.getState().updateServer(server.serverId, {
    chaosPreset: preset,
    chaosStartedAt: preset === "none" ? null : (server.chaosStartedAt ?? Date.now()),
    stopConditions: stop,
    networkConfig: configWith(server, config),
  });
  send(server.serverId, "mock:chaos:set", { config, preset });
}

/**
 * Delay the mock's answers by a range and jitter, or not at all. A preset
 * draws its delays log-normally, as the mock's own profiles do.
 *
 * @param server - The mock server
 * @param preset - The preset, `custom` or `none`
 * @param range - The range and jitter in ms, for a preset other than `none`
 * @example
 * ```ts
 * setLatency(server, "custom", { min: 400, max: 400, jitter: 120 });
 * ```
 */
export function setLatency(
  server: MockServerInfo,
  preset: LatencyPreset,
  range: { min: number; max: number; jitter: number },
): void {
  const latency = preset === "none" ? 0 : { ...range, distribution: LATENCY_DEFAULTS.distribution };
  useMockStore.getState().updateServer(server.serverId, {
    latencyPreset: preset,
    latencyStartedAt: preset === "none" ? null : Date.now(),
    networkConfig: configWith(server, { latency }),
  });
  send(server.serverId, "mock:network:set", { config: { latency }, preset });
}

/**
 * Cap how fast the mock sends its answers' bodies, on top of any delay.
 *
 * @param server - The mock server
 * @param kbps - The cap in kilobits a second, 0 for none
 * @example
 * ```ts
 * setBandwidth(server, 512);
 * ```
 */
export function setBandwidth(server: MockServerInfo, kbps: number): void {
  useMockStore
    .getState()
    .updateServer(server.serverId, { networkConfig: configWith(server, { bandwidth: kbps }) });
  send(server.serverId, "mock:network:set", { config: { bandwidth: kbps } });
}

/**
 * Set the thresholds that halt chaos on their own; chaos in force keeps
 * running under them, and chaos started later starts under them.
 *
 * @param server - The mock server
 * @param stop - The thresholds
 * @example
 * ```ts
 * setStopConditions(server, { ...DEFAULT_STOP, enabled: true });
 * ```
 */
export function setStopConditions(server: MockServerInfo, stop: StopCondition): void {
  useMockStore.getState().updateServer(server.serverId, {
    stopConditions: stop,
    networkConfig: configWith(server, { stopConditions: stop }),
  });
  send(server.serverId, "mock:network:set", { config: { stopConditions: stop } });
}

/**
 * Set a route's own delay and failure rate, which take priority over the
 * mock's; the mock is sent every route override switched on, the ones it
 * already held included.
 *
 * @param server - The mock server
 * @param override - The route's override, its rate a share 0–1
 * @example
 * ```ts
 * setRouteOverride(server, { routeId: "users:list", enabled: true, errorRate: 0.5 });
 * ```
 */
export function setRouteOverride(server: MockServerInfo, override: RouteOverride): void {
  const others = routeOverridesOf(server).filter((r) => r.routeId !== override.routeId);
  const enabled = [...others, override].filter((r) => r.enabled);
  useMockStore.getState().setRouteOverride(server.serverId, override);
  useMockStore.getState().updateServer(server.serverId, {
    networkConfig: configWith(server, { routeOverrides: enabled }),
  });
  send(server.serverId, "mock:network:set", { config: { routeOverrides: enabled } });
}
