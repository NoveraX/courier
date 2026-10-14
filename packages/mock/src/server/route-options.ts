import { bodyLimitsOf } from "./body-limits";
import { idempotentCalls } from "./idempotent-calls";
import type { MockServerOptions } from "./mock-server-types";
import type { RouteConfig } from "./route-types";

/** What a mock's routes take from its options as given. */
export type RouteOptions = Pick<
  RouteConfig,
  "network" | "elsewhere" | "bodyLimits" | "idempotency" | "source"
>;

/**
 * What a mock's routes take from its options as given: the network it
 * simulates, the calls it leaves elsewhere, how much of a body it reads,
 * the writes it answers again, and the API it stands in for.
 *
 * @param config - The mock server's options
 * @returns The part of its route config the options decide
 * @example
 * ```ts
 * const routeConfig = { registry, history, ...routeOptionsOf(config) };
 * ```
 */
export function routeOptionsOf(config: MockServerOptions | undefined): RouteOptions {
  return {
    network: config?.network,
    elsewhere: config?.elsewhere,
    bodyLimits: bodyLimitsOf(config),
    idempotency: config?.idempotency === false ? undefined : idempotentCalls(config?.idempotency),
    source: config?.source,
  };
}
