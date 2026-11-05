import { CourierError } from "./courier-error";

/** Why a call was cancelled: its caller stopped waiting, or a newer call of its endpoint took its place. */
export type AbortErrorCode = "ABORTED" | "SUPERSEDED";

const MESSAGES: Readonly<Record<AbortErrorCode, string>> = {
  ABORTED: "The call was cancelled",
  SUPERSEDED: "A newer call of the endpoint superseded this one",
};

/**
 * Thrown when a call was cancelled before it was answered: its caller's
 * signal aborted — before the request left, while it was out, or while a
 * middleware held it between attempts — with the reason it was given as
 * the error's `cause`; or, with the code `SUPERSEDED`, a newer call of an
 * endpoint that cancels the previous one took its place. Nothing failed:
 * no retry repeats it, and `onError` is not told of it.
 *
 * @example
 * ```ts
 * try {
 *   await api.users.search({ q });
 * } catch (error) {
 *   if (isAbortError(error)) return; // the user typed on, or left the page
 *   throw error;
 * }
 * ```
 */
export class AbortError extends CourierError<AbortErrorCode> {
  /**
   * @param options - Why the call was cancelled (default: `ABORTED`), and the reason its signal gave
   */
  constructor(options: { code?: AbortErrorCode | undefined; cause?: unknown } = {}) {
    const code = options.code ?? "ABORTED";
    super(MESSAGES[code], { code, cause: options.cause });
    this.name = "AbortError";
  }
}

/** Type guard for `AbortError`. */
export function isAbortError(error: unknown): error is AbortError {
  return error instanceof AbortError;
}
