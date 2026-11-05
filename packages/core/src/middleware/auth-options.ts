import { ConfigurationError } from "../errors/configuration-error";
import type { GivenToken } from "./token-refresher";

/** Where a call's token comes from, how it is renewed and where it goes. */
export interface AuthOptions {
  /** Gives the current token before each attempt: `null`, `undefined` or `""` when there is none */
  getToken: () => GivenToken | Promise<GivenToken>;
  /** Gives a new token when the upstream answers 401: `null` or `undefined` when it cannot */
  refreshToken?: (() => GivenToken | Promise<GivenToken>) | undefined;
  /** Refuse a call before it is sent when there is no token, with a MissingTokenError (default: false) */
  required?: boolean | undefined;
  /** Header name (default: "Authorization") */
  header?: string | undefined;
  /** Auth scheme the token follows (default: "Bearer"; "" sends the token alone) */
  scheme?: string | undefined;
}

/* RFC 9110 §5.6.2: what a header's name and an auth scheme are written with. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const KNOWN: ReadonlySet<string> = new Set([
  "getToken",
  "refreshToken",
  "required",
  "header",
  "scheme",
]);

/**
 * Refuse `authMiddleware` options it cannot work with, where they are
 * written rather than on the first call: a header name or a scheme that is
 * no token, which no request can carry, an option it does not have, or a
 * `getToken` that is no function.
 *
 * @param options - The options
 * @throws {ConfigurationError} `AUTH_OPTIONS_INVALID`, naming what is wrong
 */
export function assertAuthOptions(options: AuthOptions): void {
  const unknown = Object.keys(options).find((key) => !KNOWN.has(key));
  const { getToken, refreshToken, header, scheme } = options;
  const wrong =
    unknown !== undefined
      ? `authMiddleware has no option "${unknown}"`
      : typeof getToken !== "function"
        ? "authMiddleware needs a getToken function"
        : refreshToken !== undefined && typeof refreshToken !== "function"
          ? "authMiddleware's refreshToken is no function"
          : header !== undefined && !TOKEN.test(header)
            ? `authMiddleware's header "${header}" is no header name`
            : scheme !== undefined && scheme !== "" && !TOKEN.test(scheme)
              ? `authMiddleware's scheme "${scheme}" is no auth scheme`
              : undefined;
  if (wrong !== undefined) throw new ConfigurationError("AUTH_OPTIONS_INVALID", wrong);
}
