import { readCause } from "./read-cause";

/**
 * The body Courier gives a request that got no answer, in the shape it
 * gives it, wherever it is read — the runtime's Playground result, a page,
 * Studio's intake: why no answer came, and no more. A request with no
 * answer has no body of its own, so anything else the value held is left
 * behind.
 *
 * @param data - What a status-0 result holds as its body
 * @returns `{ success: false, code?, message }`, or `undefined` for a value with no cause in it
 * @example
 * ```ts
 * unansweredBody({ success: false, code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test", extra: 1 });
 * // → { success: false, code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" }
 * ```
 */
export function unansweredBody(data: unknown): Record<string, unknown> | undefined {
  const cause = readCause(data);
  return cause && { success: false, ...cause };
}
