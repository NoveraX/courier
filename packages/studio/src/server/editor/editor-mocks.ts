import { PRESET_CONFIG } from "@/features/mocks/chaos-config";
import { PRESET_VALUES } from "@/features/mocks/latency-config";

import type { StudioMocks } from "../mcp/mock-tools";
import type { ServerState } from "../mock-manager/types";
import { type SanitizedMockCommand, sanitizeMockCommand } from "../sanitize-mock-events";

/** A mock server, as an editor lists it. */
export interface EditorMock {
  readonly id: string;
  readonly name: string;
  readonly source?: string | undefined;
  readonly status: string;
  readonly url?: string | undefined;
  readonly scenarios: readonly { readonly name: string; readonly description?: string }[];
  readonly activeScenario: string | null;
  readonly latency: string;
  readonly chaos: string;
}

/** The delays and the faults an editor may set on a mock, as Studio's Mocks page names its presets. */
export const LATENCY_PRESETS = ["none", "4g", "3g", "satellite"] as const;
export const CHAOS_PRESETS = ["stable", "degraded", "unstable", "down"] as const;

/** What an editor asks of a mock's network: a delay, a share of faults, or neither of them anymore. */
export interface ConditionsWanted {
  readonly latency?: (typeof LATENCY_PRESETS)[number] | undefined;
  readonly chaos?: (typeof CHAOS_PRESETS)[number] | undefined;
  readonly stop?: boolean | undefined;
}

/**
 * The mocks Studio runs, as an editor lists them: each one's name and
 * source, whether it runs and where, its scenarios and the one in force,
 * and the delay and faults set on it.
 *
 * @param mocks - Studio's mocks
 * @returns The mocks
 * @example
 * ```ts
 * editorMocks(mockManager)[0]?.activeScenario; // "empty"
 * ```
 */
export function editorMocks(mocks: Pick<StudioMocks, "describeServers">): EditorMock[] {
  return mocks.describeServers().map((state) => ({
    id: state.serverId,
    name: state.name,
    source: state.source,
    status: state.status,
    url: state.url,
    scenarios: state.scenarios.map(({ name, description }) => ({
      name,
      ...(description && { description }),
    })),
    activeScenario: state.activeScenario,
    latency: state.latencyPreset ?? "none",
    chaos: state.chaosPreset ?? "none",
  }));
}

/**
 * The commands that set a mock's network as Studio's Mocks page does: a
 * delay preset, a fault preset — its stop conditions kept — or, to stop,
 * no delay, no faults, no cap and every route override switched off.
 *
 * @param state - The mock, as it stands
 * @param wanted - What to set
 * @returns The commands, in the order they are sent
 * @example
 * ```ts
 * conditionCommands(state, { latency: "3g" });
 * ```
 */
export function conditionCommands(
  state: ServerState,
  wanted: ConditionsWanted,
): SanitizedMockCommand[] {
  const serverId = state.serverId;
  const raw: Record<string, unknown>[] = [];
  if (wanted.stop) {
    const routeOverrides = routesOf(state).map((route) => ({ ...route, enabled: false }));
    const config = { latency: 0, bandwidth: 0, uploads: {}, routeOverrides };
    raw.push({ action: "mock:network:set", serverId, config, preset: "none" });
    raw.push({
      action: "mock:chaos:set",
      serverId,
      config: { errorRate: 0, faultWeights: [] },
      preset: "none",
    });
  }
  if (wanted.latency) raw.push(latencyCommand(serverId, wanted.latency));
  if (wanted.chaos) raw.push(chaosCommand(state, wanted.chaos));
  return raw.flatMap((command) => sanitizeMockCommand(command) ?? []);
}

function latencyCommand(serverId: string, preset: ConditionsWanted["latency"] & string) {
  const range = PRESET_VALUES[preset];
  const latency = preset === "none" ? 0 : { distribution: "log-normal", ...range };
  return { action: "mock:network:set", serverId, config: { latency }, preset };
}

function chaosCommand(state: ServerState, mode: ConditionsWanted["chaos"] & string) {
  const { errorRate, faultWeights } = PRESET_CONFIG[mode];
  const stopConditions = state.networkConfig?.stopConditions;
  const config = {
    errorRate: errorRate / 100,
    faultWeights,
    ...(stopConditions !== undefined && { stopConditions }),
  };
  return {
    action: "mock:chaos:set",
    serverId: state.serverId,
    config,
    preset: mode === "stable" ? "none" : mode,
  };
}

function routesOf(state: ServerState): Record<string, unknown>[] {
  const overrides = state.networkConfig?.routeOverrides;
  return Array.isArray(overrides)
    ? overrides.filter(
        (each): each is Record<string, unknown> => typeof each === "object" && each !== null,
      )
    : [];
}
