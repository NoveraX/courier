/** The Playground's part of its address: the endpoint chosen, by its key. */
export interface PlaygroundSearch {
  endpoint?: string | undefined;
}

/**
 * Read the Playground's parameters from its address.
 *
 * @param raw - The address's parameters
 * @returns The endpoint chosen, when the address names one
 * @example
 * ```ts
 * validatePlaygroundSearch({ endpoint: "api.orders.create" }); // { endpoint: "api.orders.create" }
 * ```
 */
export function validatePlaygroundSearch(raw: Record<string, unknown>): PlaygroundSearch {
  return typeof raw.endpoint === "string" && raw.endpoint ? { endpoint: raw.endpoint } : {};
}
