import type { MockScenario } from "../types";
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

/** Full result of scenario introspection */
export interface ScenarioIntrospectionResult {
  endpoints: ScenarioEndpointEntry[];
  stateTransitions: StateTransition[];
  hasStateMachine: boolean;
}

/** Map common latency preset strings to approximate milliseconds */
function presetToMs(preset: string): number | undefined {
  switch (preset) {
    case "wifi":
      return 50;
    case "4g":
      return 500;
    case "3g":
      return 2000;
    case "2g":
      return 5000;
    case "gprs":
      return 10000;
    default:
      return undefined;
  }
}

function latencyToMs(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") return presetToMs(value);
  if (value && typeof value === "object" && "min" in value && "max" in value) {
    const l = value as { min: number; max: number };
    return Math.round((l.min + l.max) / 2);
  }
  return undefined;
}

/**
 * Run scenario.apply() with a spy mock to extract endpoint metadata without
 * actually registering any handlers. Returns endpoints + state machine info.
 *
 * This solves the fundamental problem: MockScenario.apply() is imperative,
 * so endpoint metadata is only knowable by running the function.
 */
export function introspectScenario(
  scenario: MockScenario,
  routes: RouteInfo[],
): ScenarioIntrospectionResult {
  const records = new Map<string, ScenarioEndpointEntry>();
  const transitions: StateTransition[] = [];
  let currentState: string | null = null;

  const getOrCreate = (group: string, endpoint: string): ScenarioEndpointEntry => {
    const key = `${group}::${endpoint}`;
    let entry = records.get(key);
    if (!entry) {
      const route = routes.find((r) => r.group === group && r.endpoint === endpoint);
      entry = { group, endpoint, httpMethod: route?.httpMethod ?? "GET", behavior: "custom" };
      records.set(key, entry);
    }
    return entry;
  };

  const makeBuilder = (group: string, endpoint: string): Record<string, unknown> => {
    getOrCreate(group, endpoint);
    const builder: Record<string, (...args: unknown[]) => unknown> = {};

    builder.resolves = () => {
      getOrCreate(group, endpoint).behavior = "resolves";
      return builder;
    };
    builder.returns = () => {
      getOrCreate(group, endpoint).behavior = "returns";
      return builder;
    };
    builder.rejects = (status: unknown) => {
      const entry = getOrCreate(group, endpoint);
      entry.behavior = "rejects";
      if (typeof status === "number") entry.statusCode = status;
      return builder;
    };
    builder.sequence = (items: unknown) => {
      const entry = getOrCreate(group, endpoint);
      entry.behavior = "sequence";
      if (Array.isArray(items)) entry.sequenceLength = items.length;
      return builder;
    };
    builder.withLatency = (l: unknown) => {
      const ms = latencyToMs(l);
      if (ms !== undefined) getOrCreate(group, endpoint).latency = ms;
      return builder;
    };
    builder.delay = (ms: unknown) => {
      if (typeof ms === "number") getOrCreate(group, endpoint).latency = ms;
      return builder;
    };
    builder.inState = (state: unknown) => {
      if (typeof state === "string") {
        currentState = state;
        getOrCreate(group, endpoint).stateCondition = state;
      }
      return builder;
    };
    builder.transitionTo = (toState: unknown) => {
      if (typeof toState === "string" && currentState !== null) {
        transitions.push({ from: currentState, to: toState, trigger: `${group}.${endpoint}` });
      }
      return builder;
    };
    // Fluent decorators — pass through without recording
    builder.once = () => builder;
    builder.withHeaders = () => builder;
    builder.withStatus = () => builder;

    return builder;
  };

  try {
    // biome-ignore lint: spy mock intentionally uses any
    scenario.apply(makeBuilder as any);
  } catch {
    // Introspection must never throw — errors are safe to swallow here
  }

  return {
    endpoints: [...records.values()],
    stateTransitions: transitions,
    hasStateMachine: transitions.length > 0 || scenario.initialState !== undefined,
  };
}
