/**
 * Pure helpers for resolving prefix-route method names and parameter shapes.
 *
 * Map an incoming HTTP request (path id, query params, body) to a mock
 * endpoint name by:
 *
 * - Inspecting analyzed `MappedEndpoint` operations (the source of truth)
 * - Falling back to exact-name matches and naming-convention regex patterns
 * - Auto-coercing numeric path/query values into JS numbers
 * - Building the variables object using the endpoint's declared param name
 *   (e.g. `:petId` → `{ petId, id }`)
 *
 * All helpers are pure and synchronous.
 */

import { pathShape } from "./path-shape";
import type { EndpointOperation, MappedEndpoint } from "./prefix-route-types";

const CATCH_ALL_SHAPES = new Set(["collection", "record"]);

/**
 * Resolve the endpoint a prefix catch-all answers by its analyzed operation.
 * Only an endpoint at the collection root or at a single parameter is one
 * the catch-alls serve; a lookup such as `by-email/:email` has a route of
 * its own and must not answer `/users/5`.
 */
export function resolveByOperation(
  endpoints: MappedEndpoint[] | undefined,
  operation: EndpointOperation,
): MappedEndpoint | undefined {
  return endpoints?.find(
    (e) => e.operation === operation && CATCH_ALL_SHAPES.has(pathShape(e.path)),
  );
}

/** Build variables with the correct param name from endpoint path (e.g. ":petId" → { petId: val }) */
export function buildIdVars(
  ep: MappedEndpoint | undefined,
  id: string | number,
): Record<string, unknown> {
  if (!ep?.path) return { id };
  const match = ep.path.match(/^:(\w+)/);
  const paramName = match?.[1];
  return paramName ? { [paramName]: id, id } : { id };
}

/** Resolve GET method: if variables have known filter keys, use specific method */
export function resolveGetMethod(methods: string[], variables: Record<string, unknown>): string {
  for (const [key] of Object.entries(variables)) {
    const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
    const exact = `getBy${capitalized}`;
    if (methods.includes(exact)) return exact;
    const withoutId = exact.replace(/Id$/, "");
    if (withoutId !== exact && methods.includes(withoutId)) return withoutId;
    const stripped = `getBy${capitalized.replace(/Id$/, "")}`;
    if (stripped !== exact && methods.includes(stripped)) return stripped;
  }
  const listMethod = methods.find((m) => /^(list|getAll|findAll|findMany)/.test(m));
  return listMethod ?? "getAll";
}

/** Resolve method name: try exact matches first, then regex pattern on available methods */
export function resolveMethod(methods: string[], exact: string[], pattern: RegExp): string {
  for (const name of exact) {
    if (methods.includes(name)) return name;
  }
  const match = methods.find((m) => pattern.test(m));
  return match ?? exact[0] ?? "unknown";
}

/**
 * Parse a path or query value: a number when it is one written the way a
 * number is written, the string otherwise.
 *
 * Any value `Number()` accepted used to become a number, so `"007"` became
 * `7`, `""` became `0` and `"1e3"` became `1000` — a zip code or a
 * zero-padded id lost what it was.
 */
export function parseId(raw: string): string | number {
  const num = Number(raw);
  return raw !== "" && Number.isFinite(num) && String(num) === raw ? num : raw;
}

/** Parse query params, turning values written as numbers into numbers */
export function parseQueryParams(params: URLSearchParams): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of params) result[key] = parseId(value);
  return result;
}

/** Parse a route's path parameters, turning values written as numbers into numbers */
export function parsePathParams(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") result[key] = parseId(value);
  }
  return result;
}
