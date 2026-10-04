import type { DescribedRoute } from "@noverax/courier-mock/managed";

import { isPlainObject } from "../is-plain-object";

const SOURCES: ReadonlySet<unknown> = new Set(["auto", "override", "scenario"]);

function isFieldTypes(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  const types: unknown[] = Object.values(value);
  return types.every((type) => typeof type === "string");
}

/**
 * Whether a value a mock's worker sent is a route as Studio lists it.
 *
 * @param value - The value, as the worker's message carried it
 * @returns Whether it has every field of `DescribedRoute`, each of its type
 * @example
 * ```ts
 * if (isListOf(event.routes, isDescribedRoute)) state.routes = event.routes;
 * ```
 */
export function isDescribedRoute(value: unknown): value is DescribedRoute {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.group === "string" &&
    typeof value.endpoint === "string" &&
    typeof value.httpMethod === "string" &&
    typeof value.path === "string" &&
    typeof value.fullPath === "string" &&
    SOURCES.has(value.source) &&
    typeof value.hits === "number" &&
    typeof value.avgLatency === "number" &&
    (value.responseSchema === undefined || isFieldTypes(value.responseSchema))
  );
}
