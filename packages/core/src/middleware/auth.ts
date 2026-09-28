import { HTTPError } from "../errors";
import { defineMiddleware } from "./define";
import type { Middleware, MiddlewareResponse, NextFn } from "./types";

const UNAUTHORIZED = 401;

/**
 * Auth middleware — attaches a token, and refreshes it once when the upstream
 * answers 401.
 *
 * With `refreshToken`, a request refused with 401 is sent again carrying the
 * token it returns; a second 401 is the caller's to handle. Requests refused
 * while a refresh is already running wait for that refresh rather than
 * starting their own, so a refresh token that may be used only once is spent
 * once.
 *
 * @param options - Where the token comes from, how to renew it, and where it goes
 * @returns The middleware, to place on a source or an endpoint
 *
 * @example
 * ```ts
 * defineApi({
 *   middleware: [
 *     authMiddleware({
 *       getToken: () => session.accessToken,
 *       refreshToken: async () => (await session.renew()).accessToken,
 *     }),
 *   ],
 *   groups: { ... },
 * });
 * ```
 */
export function authMiddleware(options: {
  /** Function to get the current auth token */
  getToken: () => string | Promise<string>;
  /** Optional function returning a new token, called when a request is refused with 401 */
  refreshToken?: () => string | Promise<string>;
  /** Header name (default: "Authorization") */
  header?: string;
  /** Auth scheme prefix (default: "Bearer") */
  scheme?: string;
}): Middleware {
  const { getToken, refreshToken, header = "Authorization", scheme = "Bearer" } = options;
  const refresh = refreshToken ? sharedRefresh(refreshToken) : undefined;

  const formatToken = (token: string): string => (scheme ? `${scheme} ${token}` : token);

  // Wraps because it may send the request again (needs response access)
  return defineMiddleware("auth", "wrap", async (ctx, next) => {
    ctx.headers.set(header, formatToken(await getToken()));
    if (!refresh) return next();

    const answer = await answerUnlessUnauthorized(next);
    if (answer) return answer;

    ctx.headers.set(header, formatToken(await refresh()));
    return next();
  });
}

/**
 * Run the rest of the chain, or report that it was refused with 401.
 *
 * The upstream's refusal arrives as a thrown `HTTPError`, since a non-2xx
 * answer rejects the call; a middleware further in may also answer 401
 * without throwing. Both mean the same thing here.
 */
async function answerUnlessUnauthorized(next: NextFn): Promise<MiddlewareResponse | undefined> {
  try {
    const response = await next();
    return response.status === UNAUTHORIZED ? undefined : response;
  } catch (error) {
    if (error instanceof HTTPError && error.status === UNAUTHORIZED) return undefined;
    throw error;
  }
}

/** One refresh at a time: callers arriving while it runs get its result. */
function sharedRefresh(refreshToken: () => string | Promise<string>): () => Promise<string> {
  let pending: Promise<string> | undefined;
  return () => {
    pending ??= Promise.resolve()
      .then(refreshToken)
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}
