import { fillPathParams, withoutTrailingSlashes } from "@noverax/courier/internal";

/**
 * The URL a mock route is called at: the mock server's address, then the
 * route's path as a request sends it — `::` as one colon — with each
 * parameter left as `:name` for the caller to fill.
 *
 * @param serverUrl - The mock server's address
 * @param fullPath - The route's path, as its endpoint declares it under its group
 * @returns The URL
 * @example
 * ```ts
 * mockRouteUrl("http://localhost:7001/", "/v1/urlInspection/index::inspect");
 * // → "http://localhost:7001/v1/urlInspection/index:inspect"
 * ```
 */
export function mockRouteUrl(serverUrl: string, fullPath: string): string {
  return `${withoutTrailingSlashes(serverUrl)}${fillPathParams(fullPath, (name) => `:${name}`)}`;
}
