import { defineMiddleware } from "./compose";
import type { MiddlewareFn } from "./types";

/**
 * Auth middleware — attaches token and optionally refreshes on 401.
 *
 * @example
 * defineApi({
 *   middleware: [authMiddleware({ getToken: () => localStorage.getItem("token")! })],
 *   groups: { ... },
 * })
 */
export function authMiddleware(options: {
  /** Function to get the current auth token */
  getToken: () => string | Promise<string>;
  /** Optional function to refresh the token on 401 */
  refreshToken?: () => string | Promise<string>;
  /** Header name (default: "Authorization") */
  header?: string;
  /** Auth scheme prefix (default: "Bearer") */
  scheme?: string;
}): MiddlewareFn {
  const { getToken, refreshToken, header = "Authorization", scheme = "Bearer" } = options;

  const formatToken = (token: string) => (scheme ? `${scheme} ${token}` : token);

  return defineMiddleware(async (ctx, next) => {
    const token = await getToken();
    ctx.headers.set(header, formatToken(token));

    const response = await next();

    if (response.status === 401 && refreshToken) {
      const newToken = await refreshToken();
      ctx.headers.set(header, formatToken(newToken));
      return next();
    }

    return response;
  });
}
