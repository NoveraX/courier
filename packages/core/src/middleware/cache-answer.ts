import { createLogger } from "../logger";
import { cloneData } from "../utils/clone-data";
import { isError } from "../utils/is-error";
import { isReadableStream } from "../utils/is-readable-stream";
import type { MiddlewareResponse } from "./types";

/* An answer the cache keeps: whether it may, and the copy each caller is given. */

const log = createLogger("Middleware");

/**
 * Whether an answer can be replayed without belonging to whoever earned it:
 * a success, with no cookie set for one caller, and no stream, which its
 * first reader spends.
 *
 * @param response - The answer
 * @returns Whether the cache may keep it
 * @example
 * ```ts
 * isStorable({ status: 200, headers: new Headers(), data: { id: 1 } }); // → true
 * ```
 */
export function isStorable(response: MiddlewareResponse): boolean {
  if (response.status < 200 || response.status >= 300) return false;
  /* Set-Cookie makes a response the property of one caller by construction. */
  if (response.headers?.has("set-cookie")) return false;
  /* A stream is consumed by its first reader; the second would get nothing. */
  if (isStream(response.data)) return false;
  return true;
}

/**
 * An answer nobody else holds.
 *
 * Each caller gets a copy of the stored answer, so one that edits its result
 * edits no later caller's. Undefined when the data holds something the
 * structured clone algorithm refuses; such an answer is not shared at all.
 *
 * @param response - The answer kept, or to keep
 * @returns A copy of it, or undefined when its data cannot be copied
 * @example
 * ```ts
 * const hit = copyOf(cached.data);
 * ```
 */
export function copyOf(response: MiddlewareResponse): MiddlewareResponse | undefined {
  try {
    return {
      status: response.status,
      headers: new Headers(response.headers),
      data: cloneData(response.data),
    };
  } catch (error) {
    if (!(isError(error) && error.name === "DataCloneError")) throw error;
    log.debug("Answer not cached: its data holds a value that cannot be copied", error);
    return undefined;
  }
}

function isStream(data: unknown): boolean {
  return (
    isReadableStream(data) ||
    (typeof data === "object" && data !== null && Symbol.asyncIterator in data)
  );
}
