/**
 * Whether a value is a promise, whichever realm or library made it: a
 * thenable, as `await` takes one. Where a test runs in a context of its
 * own, as Jest runs each file, the promise Node's `fetch` or
 * `Response.json()` gives is of Node's realm, no instance of the context's
 * `Promise`.
 *
 * @param value - Anything
 * @returns Whether it has a `then` to wait on
 * @example
 * ```ts
 * isPromiseLike(new Response("{}").json()); // → true
 * isPromiseLike({ token: "t" }); // → false
 * ```
 */
export function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  return typeof Reflect.get(value, "then") === "function";
}
