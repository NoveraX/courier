/**
 * The budget a public demo gives its visitors on Studio's API.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express-serve-static-core";

import type { StudioToken } from "../studio-token";
import { TOKEN_HEADER } from "../token-guard";
import type { DemoLimits } from "./demo-limits";

/** The largest body a demo's API reads: a spec pasted in, the log exported. */
export const DEMO_MAX_BODY = 16 * 1024 * 1024;

/**
 * Count each request to Studio's API from a caller without the token toward
 * one budget for every visitor, and answer one past it with 429 and
 * `STUDIO_DEMO_BUSY`. Parsing a spec or generating its code is work every
 * visitor waits on; a caller with the token is not counted.
 *
 * @param token - The project's token
 * @param limits - The visitors' counts
 * @returns The middleware, mounted on `/api` before the routes
 * @example
 * ```ts
 * app.use("/api", demoRestGuard(token, limits));
 * ```
 */
export function demoRestGuard(token: StudioToken, limits: DemoLimits): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== "POST" || token.matches(req.get(TOKEN_HEADER))) {
      next();
      return;
    }
    const refusal = limits.take("*", "rest");
    if (refusal === null) next();
    else res.status(429).json({ error: refusal, code: "STUDIO_DEMO_BUSY" });
  };
}
