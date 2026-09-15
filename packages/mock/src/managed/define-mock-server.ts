import type { MockServerConfig, MockServerDefinition } from "./types";

/**
 * Define a mock server configuration.
 *
 * Place in `mock-servers/` for Studio to auto-discover and manage.
 * Conventions: `mock-servers/*.server.ts` or `mock-servers/{name}/server.ts`.
 * Export as named `mockServer` for auto-detection.
 *
 * Servers are NOT auto-started by default — start manually from Studio UI
 * or set `autoStart: true` to launch when Studio starts.
 *
 * @param config - Server configuration (source, port, seed, overrides, etc.)
 * @returns Typed definition object consumed by Studio lifecycle manager
 *
 * @example
 * ```ts
 * // mock-servers/jsonPlaceholder.server.ts
 * import { defineMockServer } from "@noverax/courier-mock";
 * import { jsonPlaceholder } from "../src/api/jsonPlaceholder";
 *
 * export const mockServer = defineMockServer({
 *   source: jsonPlaceholder,
 *   port: 7001,
 *   seed: { count: 20 },
 *   autoStart: true, // launch when Studio starts
 * });
 * ```
 */
export function defineMockServer(config: MockServerConfig): MockServerDefinition {
  return {
    __type: "courier-mock-server",
    port: config.port ?? 0,
    autoStart: config.autoStart ?? false,
    ...config,
  };
}

/** Check if a value is a MockServerDefinition */
export function isMockServerDefinition(value: unknown): value is MockServerDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).__type === "courier-mock-server"
  );
}
