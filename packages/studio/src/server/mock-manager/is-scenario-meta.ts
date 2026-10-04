import { isPlainObject } from "../is-plain-object";
import { isListOf } from "./is-list-of";
import type { ScenarioMeta } from "./types";

type Transition = ScenarioMeta["stateTransitions"][number];
type ScenarioEndpoint = ScenarioMeta["endpoints"][number];

const BEHAVIORS: ReadonlySet<unknown> = new Set([
  "resolves",
  "returns",
  "rejects",
  "custom",
  "sequence",
]);

function isOptional(value: unknown, type: "string" | "number"): boolean {
  return value === undefined || typeof value === type;
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isTransition(value: unknown): value is Transition {
  return (
    isPlainObject(value) &&
    typeof value.from === "string" &&
    typeof value.to === "string" &&
    typeof value.trigger === "string"
  );
}

function isScenarioEndpoint(value: unknown): value is ScenarioEndpoint {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.group === "string" &&
    typeof value.endpoint === "string" &&
    typeof value.httpMethod === "string" &&
    BEHAVIORS.has(value.behavior) &&
    isOptional(value.latency, "number") &&
    isOptional(value.statusCode, "number") &&
    isOptional(value.sequenceLength, "number") &&
    isOptional(value.stateCondition, "string")
  );
}

/**
 * Whether a value a mock's worker sent is a scenario as Studio lists it.
 *
 * @param value - The value, as the worker's message carried it
 * @returns Whether it has every field of {@link ScenarioMeta}, each of its type
 * @example
 * ```ts
 * if (isListOf(event.scenarios, isScenarioMeta)) state.scenarios = event.scenarios;
 * ```
 */
export function isScenarioMeta(value: unknown): value is ScenarioMeta {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.name === "string" &&
    isOptional(value.description, "string") &&
    (value.tags === undefined || isListOf(value.tags, isText)) &&
    typeof value.endpointCount === "number" &&
    typeof value.isActive === "boolean" &&
    typeof value.hasStateMachine === "boolean" &&
    isOptional(value.introspectionError, "string") &&
    isListOf(value.stateTransitions, isTransition) &&
    isListOf(value.endpoints, isScenarioEndpoint)
  );
}
