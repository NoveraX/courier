/**
 * Whether a value is an error, whichever realm made it. Where a test runs
 * in a context of its own, as Jest runs each file, what Node throws itself
 * — fetch's `TypeError`, the `DOMException` an `AbortSignal` gives as its
 * reason — is no instance of that context's `Error`, nor of a
 * `DOMException` a polyfill set as the global one, as jest-expo sets one.
 * `Error.isError` tells an error of any realm where the engine has it;
 * where it has not, as in Node 22, an error is told by what it says it is.
 *
 * @param value - Anything
 * @returns Whether it is an `Error` or a `DOMException`
 * @example
 * ```ts
 * isError(runInNewContext("new TypeError('of another realm')")); // → true
 * isError({ name: "TypeError", message: "no" }); // → false
 * ```
 */
export function isError(value: unknown): value is Error {
  if (value instanceof Error) return true;
  if (typeof Error.isError === "function") return Error.isError(value);
  const tag = Object.prototype.toString.call(value);
  return tag === "[object Error]" || tag === "[object DOMException]";
}

/**
 * Whether a value is an error of the kind `name` says, whichever realm made
 * it: told by its name, as an error of another realm is no instance of
 * this one's `TypeError` or `AggregateError`.
 *
 * @param value - Anything
 * @param name - The kind: `TypeError`, `AggregateError`
 * @returns Whether it is an error of that kind
 * @example
 * ```ts
 * isErrorNamed(new TypeError("fetch failed"), "TypeError"); // → true
 * ```
 */
export function isErrorNamed<K extends keyof ErrorKinds>(
  value: unknown,
  name: K,
): value is ErrorKinds[K] {
  return isError(value) && value.name === name;
}

/** The kinds of error Courier tells apart by name. */
export interface ErrorKinds {
  TypeError: TypeError;
  AggregateError: AggregateError;
}
