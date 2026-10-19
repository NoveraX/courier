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

import { pathPieces } from "@noverax/courier/internal";

import { type PathShape, pathShape } from "./path-shape";
import type { EndpointOperation, MappedEndpoint } from "./prefix-route-types";

/* The shapes and verbs the prefix catch-alls answer, with their
   by-convention fallbacks; every other endpoint gets a route of its own. */
const CATCH_ALL = new Map<PathShape, ReadonlySet<string>>([
  ["collection", new Set(["GET", "POST", "DELETE"])],
  ["record", new Set(["GET", "PUT", "PATCH", "DELETE"])],
]);

/**
 * Whether a prefix catch-all answers an endpoint: one at the collection root
 * or at a single parameter, addressed with a verb the catch-all takes there.
 *
 * @param ep - The endpoint
 * @returns Whether `/users` or `/users/:id` reaches it without a route of its own
 * @example
 * ```ts
 * servedByCatchAll({ name: "list", operation: "list", path: "", httpMethod: "GET" }); // → true
 * servedByCatchAll({ name: "search", operation: "list", path: "", httpMethod: "QUERY" }); // → false
 * ```
 */
export function servedByCatchAll(ep: MappedEndpoint): boolean {
  /* A path that fixes query values tells its endpoint apart from another at it: a route of its own. */
  if (ep.fixedQuery !== undefined) return false;
  const verbs = CATCH_ALL.get(pathShape(ep.path));
  return verbs?.has((ep.httpMethod ?? "GET").toUpperCase()) ?? false;
}

/**
 * Resolve the endpoint a prefix catch-all answers by its analyzed operation.
 * A lookup such as `by-email/:email` has a route of its own and must not
 * answer `/users/5`, and neither may a QUERY that lists the collection
 * answer its GET.
 */
export function resolveByOperation(
  endpoints: MappedEndpoint[] | undefined,
  operation: EndpointOperation,
): MappedEndpoint | undefined {
  return endpoints?.find((e) => e.operation === operation && servedByCatchAll(e));
}

/** Build variables with the correct param name from endpoint path (e.g. ":petId" → { petId: val }) */
export function buildIdVars(
  ep: MappedEndpoint | undefined,
  id: string | number,
): Record<string, unknown> {
  if (!ep?.path) return { id };
  const [first] = pathPieces(ep.path);
  return first?.kind === "param" ? { [first.name]: id, id } : { id };
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
 * Only a value written as a number is read as one: `Number()` turns `"007"`
 * into `7`, `""` into `0` and `"1e3"` into `1000`, and a zip code or a
 * zero-padded id would lose what it was.
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
