import { HTTPError } from "../errors";
import { MissingTokenError } from "../errors/missing-token-error";
import { sendableValue } from "../utils/header-value";
import { isReplayableBody } from "../utils/replayable-body";
import { type AuthOptions, assertAuthOptions } from "./auth-options";
import { defineMiddleware } from "./define";
import { tokenOf, tokenRefresher } from "./token-refresher";
import type { Middleware, MiddlewareContext, MiddlewareResponse, NextFn } from "./types";

const UNAUTHORIZED = 401;

/** How one attempt ended: with an answer, or with the error it was rejected with. */
type Attempt = { readonly response: MiddlewareResponse } | { readonly error: unknown };

/**
 * Auth middleware — sends the token `getToken` gives, and renews it once
 * when the upstream answers 401.
 *
 * A call made while there is no token — `getToken` gives `null`,
 * `undefined` or `""` — goes without the header, so a page signs in
 * through the very API that sends the token; a header the call set itself
 * is left as it is. With `required: true` such a call is refused before it
 * is sent, with a `MissingTokenError`. A token that holds a NUL or a line
 * break, which no header carries, is refused before the request leaves,
 * and the error never repeats it.
 *
 * With `refreshToken`, a request refused with 401 is sent again carrying
 * the token it gives; a second 401 is the caller's to handle, and so is
 * the first when the refresh gives no token or the request's body is a
 * stream that cannot be sent twice. Every call refused while a refresh
 * runs, or sent before one that has since ended, takes that refresh's
 * token, so a refresh token that may be used only once is spent once
 * however the refusals fall.
 *
 * @param options - Where the token comes from, how to renew it, and where it goes
 * @returns The middleware, to place on a source or an endpoint
 * @throws {ConfigurationError} `AUTH_OPTIONS_INVALID`, for options it cannot work with
 *
 * @example
 * ```ts
 * defineApi({
 *   middleware: [
 *     authMiddleware({
 *       getToken: () => session.accessToken, // undefined before sign-in: no header
 *       refreshToken: async () => (await session.renew()).accessToken,
 *     }),
 *   ],
 *   groups: { ... },
 * });
 * ```
 */
export function authMiddleware(options: AuthOptions): Middleware {
  assertAuthOptions(options);
  const { getToken, refreshToken, required = false, header = "Authorization" } = options;
  const scheme = options.scheme ?? "Bearer";
  const refresher = refreshToken ? tokenRefresher(refreshToken) : undefined;

  const attach = (ctx: MiddlewareContext, token: string | undefined, from: string): void => {
    if (token === undefined) {
      if (required) throw new MissingTokenError(header);
      return;
    }
    const value = scheme ? `${scheme} ${token}` : token;
    ctx.headers.set(
      header,
      sendableValue(header, value, `The token ${from} gave for the ${header} header`),
    );
  };

  // Wraps because it may send the request again (needs response access)
  return defineMiddleware("auth", "wrap", async (ctx, next) => {
    const sentAt = refresher?.generation ?? 0;
    attach(ctx, tokenOf(await getToken()), "getToken");
    if (!refresher) return next();

    const first = await settle(next);
    if (!isUnauthorized(first) || !isReplayableBody(ctx.variables)) return unwrap(first);
    const renewed = await refresher.renew(sentAt);
    if (renewed === undefined) return unwrap(first);
    attach(ctx, renewed, "refreshToken");
    return next();
  });
}

async function settle(next: NextFn): Promise<Attempt> {
  try {
    return { response: await next() };
  } catch (error) {
    return { error };
  }
}

function unwrap(attempt: Attempt): MiddlewareResponse {
  if ("error" in attempt) throw attempt.error;
  return attempt.response;
}

/**
 * Was the attempt refused with 401?
 *
 * The upstream's refusal arrives as a thrown `HTTPError`, since a non-2xx
 * answer rejects the call; a middleware further in may also answer 401
 * without throwing. Both mean the same thing here.
 */
function isUnauthorized(attempt: Attempt): boolean {
  if ("response" in attempt) return attempt.response.status === UNAUTHORIZED;
  return attempt.error instanceof HTTPError && attempt.error.status === UNAUTHORIZED;
}
