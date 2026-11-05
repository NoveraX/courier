import type { EnvelopeRefusal } from "../../adapter/envelope-result";

/**
 * Find the refusal of an upload a proxied call was sending, as a page's
 * bundle has it: never. Only a server proxies an upload; a bundler that
 * builds for the browser takes this module in place of the one that looks.
 *
 * @param _error - What the call failed with
 * @param _variables - The call's variables
 * @returns Nothing
 * @example
 * ```ts
 * unsentUpload(new Error("fetch failed")); // → undefined
 * ```
 */
export function unsentUpload(_error: unknown, _variables?: unknown): EnvelopeRefusal | undefined {
  return undefined;
}
