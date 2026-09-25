import type { MockServerEntry } from "./types";

/**
 * Declare the mock servers Studio runs, by key — the default export of
 * `courier.mocks.ts`, beside `courier.config.ts`.
 *
 * The mocks live in their own file because `courier.config.ts` is also loaded
 * in production, where development tools such as this package are not
 * installed; only Studio reads `courier.mocks.ts`. Studio looks in the
 * directory holding `courier.config` for `courier.mocks.ts`, `.mts`, `.cts`,
 * `.js`, `.mjs` and `.cjs`, in that order, and loads the first it finds.
 *
 * The key names the mock in Studio. A key left `undefined` declares no mock,
 * so one can be switched off in place.
 *
 * @param mocks - One `defineMockServer()` result per key
 * @returns The same record, typed
 *
 * @example
 * ```ts
 * // courier.mocks.ts
 * import { defineMocks, defineMockServer } from "@noverax/courier-mock";
 * import courierConfig from "./courier.config";
 *
 * export default defineMocks({
 *   apiMock: defineMockServer({ source: courierConfig.sources.api, autoStart: true }),
 * });
 * ```
 */
export function defineMocks<const TMocks extends Record<string, MockServerEntry | undefined>>(
  mocks: TMocks,
): TMocks {
  return mocks;
}
