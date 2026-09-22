/**
 * Refuse an API call that a foreign page made.
 *
 * Studio listens on the developer's own machine, which means every page they
 * have open in a browser can reach it. Without this guard any site could drive
 * Studio's own API: read the project's sources, write files through the import
 * routes, or have Studio fetch an address on the developer's private network
 * and report back by timing.
 *
 * A request carrying no `Origin` did not come from a page — curl, an editor, a
 * script — and is allowed. A browser always sends one on a cross-site call, so
 * that is the case worth refusing.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express-serve-static-core";

/**
 * Build the guard for a set of origins Studio answers to.
 *
 * @param allowed - Origins the Studio UI is served from
 * @returns Express middleware that refuses anything else
 *
 * @example
 * ```ts
 * app.use("/api", createOriginGuard(["http://localhost:6280"]));
 * ```
 */
export function createOriginGuard(allowed: readonly string[]): RequestHandler {
  const permitted = new Set(allowed);

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    /* Not a page. A browser always names its origin when calling across
       sites, so silence here means the caller is not one. */
    if (origin === undefined) {
      next();
      return;
    }

    if (permitted.has(origin)) {
      next();
      return;
    }

    res.status(403).json({
      error:
        `Studio does not answer ${origin}. Its API is reachable only from the ` +
        "Studio UI itself, so a page on another site cannot use this machine " +
        "to read the project or reach its network.",
    });
  };
}
