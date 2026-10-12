/**
 * Refuse an API call that a foreign page made.
 *
 * Without this guard any site the developer has open could drive Studio's own
 * API: read the project's sources, write files through the import routes, or
 * have Studio fetch an address on the developer's private network and report
 * back by timing.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express-serve-static-core";
import type { StudioOriginPolicy } from "./studio-origin";

/**
 * Build the guard for Studio's API.
 *
 * @param policy - Decides who counts as the Studio UI
 * @returns Express middleware that refuses anyone else
 *
 * @example
 * ```ts
 * app.use("/api", createOriginGuard(policy));
 * ```
 */
export function createOriginGuard(policy: StudioOriginPolicy): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { origin, host } = req.headers;
    if (policy.isUiCaller(origin, host)) {
      next();
      return;
    }
    const caller = origin ?? "a caller that names no origin";
    res.status(403).json({
      error:
        `Studio does not answer ${caller}. Its API is reachable only from the ` +
        "Studio UI itself, so a page on another site cannot use this machine " +
        "to read the project or reach its network.",
    });
  };
}
