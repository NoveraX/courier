import type { AnySource } from "@noverax/courier/define";
import type { MockServerConfig, MockServerDefinition } from "./types";

/**
 * Define a mock server for Studio to run.
 *
 * Declare it in `courier.mocks.ts` with `defineMocks`; Studio lists it, and
 * starts it when `autoStart` is set or when you start it from the UI. Each
 * mock runs in a process of its own, which loads the mocks file with
 * Studio's loader and serves that one mock.
 *
 * `source` is the source object the config declares: import it from where
 * the config does, or read it from the config, as in
 * `source: courierConfig.sources.api` — which needs a config whose default
 * export is `defineConfig({ sources })`. Studio loads the config and the
 * mocks file as one module graph, so either way it is the very same object.
 *
 * A `port` is held exactly — Studio reports it when it is taken. Without
 * one, Studio assigns the key a port from `studio.mockBasePort`; the mock
 * listens on the next free port above it when another process holds it as
 * the mock starts; the key is assigned another when a mock declares that
 * port, and can get another after Studio restarts. Set `port` to keep one.
 *
 * `overrides` and `scenarios` are checked against `source`: `mock` takes the
 * source's group and endpoint names, and the response each endpoint returns.
 * An endpoint the source declares outside any group is mocked under the
 * collection its path starts with — `mock("users", "listUsers")` — which is
 * not checked. `defineMockServer<AnySource>(...)` turns the checks off.
 *
 * @typeParam TSource - The API the mock serves, inferred from `source`
 * @param config - Server configuration (source, port, seed, overrides, etc.)
 * @returns Typed definition object consumed by Studio's mock manager
 *
 * @example
 * ```ts
 * // courier.mocks.ts
 * import { defineMocks, defineMockServer, defineScenario } from "@noverax/courier-mock";
 * import { api } from "./src/api";
 *
 * const outage = defineScenario<typeof api>("outage", (mock) => {
 *   mock("users", "getAll").rejects(503, { message: "Down for maintenance" });
 * });
 *
 * export default defineMocks({
 *   api: defineMockServer({
 *     source: api,
 *     port: 7001,
 *     autoStart: true,
 *     overrides: (mock) => {
 *       mock("users", "getById").rejects(404, { message: "Not found" });
 *     },
 *     scenarios: { outage },
 *   }),
 * });
 * ```
 */
export function defineMockServer<TSource extends AnySource>(
  config: MockServerConfig<TSource>,
): MockServerDefinition<TSource> {
  /* The config goes first, so an `autoStart: undefined` it spells out does
     not win over the default. */
  return {
    ...config,
    __type: "courier-mock-server",
    autoStart: config.autoStart ?? false,
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
