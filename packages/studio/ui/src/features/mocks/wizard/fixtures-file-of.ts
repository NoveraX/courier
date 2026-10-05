/**
 * Where a mock that answers with recordings keeps them: a HAR file named
 * after it, in a folder beside the mocks file, to commit with the project.
 *
 * @param key - The mock's key
 * @returns The path, relative to the mocks file
 * @example
 * ```ts
 * fixturesFileOf("shop"); // → "./fixtures/shop.har"
 * ```
 */
export function fixturesFileOf(key: string): string {
  return `./fixtures/${key}.har`;
}
