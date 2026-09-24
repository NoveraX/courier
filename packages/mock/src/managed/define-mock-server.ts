import type { MockServerConfig, MockServerDefinition } from "./types";

/**
 * Define a mock server for Studio to run.
 *
 * Declare it under `mocks` in `courier.config.ts`; Studio lists it, and
 * starts it when `autoStart` is set or when you start it from the UI. A
 * `port` is held exactly — Studio reports it when it is taken; without one,
 * Studio assigns a port from `studio.mockBasePort` and keeps it for the key.
 *
 * @param config - Server configuration (source, port, seed, overrides, etc.)
 * @returns Typed definition object consumed by Studio's mock manager
 *
 * @example
 * ```ts
 * // courier.config.ts
 * import { defineConfig } from "@noverax/courier/config";
 * import { defineMockServer } from "@noverax/courier-mock";
 * import { api } from "./src/api";
 *
 * export default defineConfig({
 *   sources: { api },
 *   mocks: {
 *     api: defineMockServer({ source: api, port: 7001, autoStart: true }),
 *   },
 * });
 * ```
 */
export function defineMockServer(config: MockServerConfig): MockServerDefinition {
  return {
    __type: "courier-mock-server",
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
