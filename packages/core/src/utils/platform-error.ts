/**
 * An error named as the web platform names it: a `DOMException` where the
 * runtime has one, an `Error` of that name where it has not — React Native
 * without Expo — so code that tells errors apart by name reads both alike.
 *
 * @param message - What happened
 * @param name - The platform's name for it: `AbortError`, `TimeoutError`
 * @returns The error
 * @example
 * ```ts
 * platformError("The operation timed out", "TimeoutError").name; // "TimeoutError"
 * ```
 */
export function platformError(message: string, name: string): Error {
  if (typeof DOMException === "function") return new DOMException(message, name);
  const error = new Error(message);
  error.name = name;
  return error;
}
