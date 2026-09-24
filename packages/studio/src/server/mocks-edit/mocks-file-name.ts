/**
 * The name Studio gives a mocks file it creates beside a config: the
 * config's own module flavour when that is an ES module in TypeScript
 * (`.mts`), so the two import each other the same way; `courier.mocks.ts`
 * otherwise.
 *
 * @param configName - The config's file name, e.g. `courier.config.mts`
 * @returns The mocks file's name
 *
 * @example
 * ```ts
 * mocksFileNameFor("courier.config.mts"); // → "courier.mocks.mts"
 * mocksFileNameFor("courier.config.js");  // → "courier.mocks.ts"
 * ```
 */
export function mocksFileNameFor(configName: string): string {
  return configName.endsWith(".mts") ? "courier.mocks.mts" : "courier.mocks.ts";
}
