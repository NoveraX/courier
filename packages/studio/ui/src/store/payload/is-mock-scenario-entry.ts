import { isPlainObject } from "@/socket/is-plain-object";
import type { MockScenarioEndpoint, MockScenarioEntry, StateTransition } from "../mock-slice-types";
import { readList } from "./read-list";

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

function isTransition(value: unknown): value is StateTransition {
  return (
    isPlainObject(value) &&
    typeof value.from === "string" &&
    typeof value.to === "string" &&
    typeof value.trigger === "string"
  );
}

function isScenarioEndpoint(value: unknown): value is MockScenarioEndpoint {
  if (!isPlainObject(value)) return false;
  return (
    (value.group === null || typeof value.group === "string") &&
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
 * Whether a socket event's item is one of a mock's scenarios, as Studio
 * describes it: its endpoints and the state transitions it makes.
 *
 * @param value - The item as the socket parsed it
 * @returns Whether it is one
 * @example
 * ```ts
 * isMockScenarioEntry({ name: "empty", endpointCount: 0, isActive: false,
 *   hasStateMachine: false, stateTransitions: [], endpoints: [] }); // → true
 * ```
 */
export function isMockScenarioEntry(value: unknown): value is MockScenarioEntry {
  if (!isPlainObject(value)) return false;
  const tags = value.tags === undefined || readList(value.tags, isText) !== undefined;
  return (
    typeof value.name === "string" &&
    isOptional(value.description, "string") &&
    tags &&
    typeof value.endpointCount === "number" &&
    typeof value.isActive === "boolean" &&
    typeof value.hasStateMachine === "boolean" &&
    readList(value.stateTransitions, isTransition) !== undefined &&
    readList(value.endpoints, isScenarioEndpoint) !== undefined
  );
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}
