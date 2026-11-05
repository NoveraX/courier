import { CourierError } from "./courier-error";

/**
 * Thrown before a call is sent when its `authMiddleware` requires a token
 * and `getToken` gave none: no session yet, or one that ended. The request
 * never left, so nothing was refused; the caller decides — sign in first.
 * Through the proxy, the browser is answered 401 with the code
 * `TOKEN_MISSING`.
 *
 * @example
 * ```ts
 * try {
 *   await api.account.get();
 * } catch (error) {
 *   if (isMissingTokenError(error)) redirect("/sign-in");
 * }
 * ```
 */
export class MissingTokenError extends CourierError<"TOKEN_MISSING"> {
  /** The header the token would have gone in. */
  readonly header: string;

  /**
   * @param header - The header the token would have gone in
   */
  constructor(header: string) {
    super(`No token to send in the ${header} header, which the call requires`, {
      code: "TOKEN_MISSING",
    });
    this.name = "MissingTokenError";
    this.header = header;
  }
}

/** Type guard for `MissingTokenError`. */
export function isMissingTokenError(error: unknown): error is MissingTokenError {
  return error instanceof MissingTokenError;
}
