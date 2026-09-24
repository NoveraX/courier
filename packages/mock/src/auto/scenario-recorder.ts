import type { EnhancedMockBuilder } from "../types";
import type { RouteInfo } from "./route-analyzer";

/** Serializable endpoint entry collected by scenario introspection */
export interface ScenarioEndpointEntry {
  group: string;
  endpoint: string;
  httpMethod: string;
  behavior: "resolves" | "returns" | "rejects" | "custom" | "sequence";
  latency?: number;
  statusCode?: number;
  sequenceLength?: number;
  stateCondition?: string;
}

/** A state transition captured from .inState() + .transitionTo() */
export interface StateTransition {
  from: string;
  to: string;
  trigger: string;
}

/** Every method a scenario may call on a mock, each recording what it learns. */
type RecordingBuilder = Record<keyof EnhancedMockBuilder, (...args: unknown[]) => RecordingBuilder>;

/** A `mock` function that records what a scenario sets up instead of doing it. */
export interface ScenarioRecorder {
  mock: (group: string, endpoint: string) => RecordingBuilder;
  endpoints: () => ScenarioEndpointEntry[];
  transitions: () => StateTransition[];
}

const LATENCY_PRESET_MS = new Map<string, number>([
  ["wifi", 50],
  ["4g", 500],
  ["3g", 2000],
  ["2g", 5000],
  ["gprs", 10000],
]);

function latencyToMs(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") return LATENCY_PRESET_MS.get(value);
  if (value && typeof value === "object" && "min" in value && "max" in value) {
    const l = value as { min: number; max: number };
    return Math.round((l.min + l.max) / 2);
  }
  return undefined;
}

/**
 * Create a recorder for one scenario's run.
 *
 * The builder it hands out is typed as the whole `EnhancedMockBuilder`, so a
 * method added there does not compile until it is recorded here — a scenario
 * using it would otherwise stop being read at that call.
 *
 * @param routes - The source's routes, for each endpoint's HTTP method
 * @returns The recording `mock` and what it recorded
 */
export function createScenarioRecorder(routes: readonly RouteInfo[]): ScenarioRecorder {
  const records = new Map<string, ScenarioEndpointEntry>();
  const recordedTransitions: StateTransition[] = [];
  let currentState: string | null = null;

  const entryFor = (group: string, endpoint: string): ScenarioEndpointEntry => {
    const key = `${group}::${endpoint}`;
    let entry = records.get(key);
    if (!entry) {
      const route = routes.find((r) => r.group === group && r.endpoint === endpoint);
      entry = { group, endpoint, httpMethod: route?.httpMethod ?? "GET", behavior: "custom" };
      records.set(key, entry);
    }
    return entry;
  };

  function mock(group: string, endpoint: string): RecordingBuilder {
    const entry = entryFor(group, endpoint);
    const behave = (behavior: ScenarioEndpointEntry["behavior"]) => () => {
      entry.behavior = behavior;
      return builder;
    };
    const passThrough = () => builder;
    const builder: RecordingBuilder = {
      resolves: behave("resolves"),
      returns: behave("returns"),
      stream: behave("custom"),
      emits: behave("custom"),
      channel: behave("custom"),
      rejects: (status) => {
        entry.behavior = "rejects";
        if (typeof status === "number") entry.statusCode = status;
        return builder;
      },
      sequence: (items) => {
        entry.behavior = "sequence";
        if (Array.isArray(items)) entry.sequenceLength = items.length;
        return builder;
      },
      withLatency: (profile) => {
        const ms = latencyToMs(profile);
        if (ms !== undefined) entry.latency = ms;
        return builder;
      },
      delay: (ms) => {
        if (typeof ms === "number") entry.latency = ms;
        return builder;
      },
      inState: (state) => {
        if (typeof state !== "string") return builder;
        currentState = state;
        entry.stateCondition = state;
        return builder;
      },
      transitionTo: (toState) => {
        if (typeof toState === "string" && currentState !== null) {
          recordedTransitions.push({
            from: currentState,
            to: toState,
            trigger: `${group}.${endpoint}`,
          });
        }
        return builder;
      },
      once: passThrough,
      times: passThrough,
      withHeaders: passThrough,
      withStatus: passThrough,
    };
    return builder;
  }

  return {
    mock,
    endpoints: () => [...records.values()],
    transitions: () => [...recordedTransitions],
  };
}
