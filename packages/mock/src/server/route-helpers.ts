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

import type { EndpointOperation, MappedEndpoint } from "./prefix-route-types";

/** Resolve endpoint by analyzed operation type — the source of truth */
export function resolveByOperation(
  endpoints: MappedEndpoint[] | undefined,
  operation: EndpointOperation,
): MappedEndpoint | undefined {
  if (!endpoints) return undefined;
  return (
    endpoints.find((e) => e.operation === operation && !e.path) ??
    endpoints.find((e) => e.operation === operation)
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

/** Parse ID — return number if numeric, string otherwise */
export function parseId(raw: string): string | number {
  const num = Number(raw);
  return Number.isNaN(num) ? raw : num;
}

/** Parse query params, auto-coercing numeric strings to numbers */
export function parseQueryParams(params: URLSearchParams): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of params) {
    const num = Number(value);
    result[key] = Number.isNaN(num) ? value : num;
  }
  return result;
}
