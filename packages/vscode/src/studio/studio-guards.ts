import type {
  CallSite,
  EndpointCall,
  EndpointDefinition,
  EndpointStats,
  Finding,
  TextSpan,
} from "./studio-types";

const SEVERITIES = new Set(["error", "warning", "hint"]);

/**
 * Whether a value is a plain object.
 *
 * @param value - The value
 * @returns Whether it is one
 * @example
 * ```ts
 * isRecord({}); // true
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isName(value: unknown): boolean {
  return isRecord(value) && typeof value.source === "string" && typeof value.endpoint === "string";
}

/** Whether Studio's item is an endpoint's stats. */
export function isStats(value: unknown): value is EndpointStats {
  return (
    isRecord(value) &&
    isName(value) &&
    typeof value.calls === "number" &&
    typeof value.failed === "number"
  );
}

/** Whether Studio's item is a call placed in a file. */
export function isCall(value: unknown): value is EndpointCall {
  return (
    isRecord(value) &&
    typeof value.line === "number" &&
    typeof value.column === "number" &&
    typeof value.endLine === "number" &&
    typeof value.endColumn === "number" &&
    Array.isArray(value.endpoints)
  );
}

/** Whether Studio's item is a call site. */
export function isSite(value: unknown): value is CallSite {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.file === "string" &&
    typeof value.line === "number" &&
    typeof value.column === "number" &&
    typeof value.code === "string"
  );
}

/** Whether Studio's item is an audit finding that names endpoints. */
export function isFinding(value: unknown): value is Finding {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.severity === "string" &&
    SEVERITIES.has(value.severity) &&
    Array.isArray(value.endpoints) &&
    value.endpoints.every(isName)
  );
}

function isSpan(value: unknown): value is TextSpan {
  return (
    isRecord(value) &&
    typeof value.line === "number" &&
    typeof value.column === "number" &&
    typeof value.endLine === "number" &&
    typeof value.endColumn === "number"
  );
}

/** Whether Studio's item is where an endpoint is declared. */
export function isDefinition(value: unknown): value is EndpointDefinition {
  return (
    isRecord(value) &&
    isName(value) &&
    isSpan(value) &&
    isSpan(value.span) &&
    typeof value.file === "string" &&
    typeof value.path === "string"
  );
}
