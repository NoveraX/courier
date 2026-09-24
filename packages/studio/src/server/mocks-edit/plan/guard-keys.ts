import { MocksEditRefusal } from "../mocks-edit-refusal";
import type { MockDeclaration } from "../types";

/**
 * Refuse requests the caller should have rejected already: none at all, a
 * key the file declares, or one key asked for twice. Planning on regardless
 * would write an object whose later key silently replaces the earlier one.
 *
 * @param literalKeys - The keys the file's mocks object declares
 * @param requests - The mocks to declare
 * @param fileName - The mocks file, for the message
 * @throws {MocksEditRefusal} `INTERNAL_PLAN_REJECTED`
 *
 * @example
 * ```ts
 * guardKeys(["users"], [{ key: "users", source: "users", port: null, seedCount: 20, autoStart: false }], "courier.mocks.ts");
 * // throws: courier.mocks.ts already declares the mock "users".
 * ```
 */
export function guardKeys(
  literalKeys: readonly string[],
  requests: readonly MockDeclaration[],
  fileName: string,
): void {
  if (requests.length === 0) {
    throw new MocksEditRefusal(
      "INTERNAL_PLAN_REJECTED",
      `Studio was asked to add no mocks to ${fileName}.`,
    );
  }
  const declared = new Set(literalKeys);
  const requested = new Set<string>();
  for (const { key, source } of requests) {
    if (declared.has(key) || requested.has(key)) {
      const why = declared.has(key) ? `${fileName} already declares` : "Studio was asked twice for";
      throw new MocksEditRefusal("INTERNAL_PLAN_REJECTED", `${why} the mock "${key}".`, { source });
    }
    requested.add(key);
  }
}
