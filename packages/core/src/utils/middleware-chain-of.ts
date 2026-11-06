import type { AnySource } from "../define/types";
import { resolveMiddlewareChain } from "./execute-options";
import { resolveEndpoint } from "./execute-resolve";

/** Where a middleware an endpoint's call runs through is declared. */
export type MiddlewareLayer = "api" | "retry" | "endpoint";

/** One middleware of the chain an endpoint's call runs through. */
export interface ChainStep {
  /** Its name, as the events of a call through it name it */
  readonly name: string;
  /** The API's own, the endpoint's `.retry()`, or what the endpoint's base and its `.use()` add */
  readonly layer: MiddlewareLayer;
}

/**
 * The middleware a call to an endpoint runs through, outermost first, read
 * from the definitions alone — before any call, as Studio shows it. It is
 * the chain a call builds, so it holds the same steps in the same order,
 * named as the call's events name them: the API's own, then the endpoint's
 * `.retry()`, then what its base `courier({ middleware })` and its own
 * `.use()` add — its own alone with `inherit: false`.
 *
 * @param dataSource - The API
 * @param group - The path of the endpoint's group; empty for the API's own endpoints
 * @param method - The endpoint's name
 * @returns The chain; empty for an endpoint with none, or one the API does not hold
 * @example
 * ```ts
 * middlewareChainOf(api, "orders", "place");
 * // → [{ name: "audit", layer: "api" }, { name: "retry", layer: "retry" }, { name: "sign", layer: "endpoint" }]
 * ```
 */
export function middlewareChainOf(
  dataSource: AnySource,
  group: string,
  method: string,
): ChainStep[] {
  const { endpoint, options } = resolveEndpoint(dataSource, group, method);
  if (endpoint === undefined) return [];
  const own = dataSource.options?.middleware ?? [];
  const chain = resolveMiddlewareChain(dataSource, own, options);
  /* A retry policy is a step of its own where the chain finds one. */
  const retried = options?.retry ? own.length + 1 : own.length;
  return chain.map(({ name }, at) => ({
    name,
    layer: at < own.length ? "api" : at < retried ? "retry" : "endpoint",
  }));
}
