/**
 * The share of a public demo's HTTP server each visitor's address may take.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express-serve-static-core";

import { DEMO_WINDOW_MS, type DemoLimits } from "./demo-limits";
import { NO_TRUSTED_PROXIES, type TrustedProxies } from "./trusted-proxies";
import { visitorAddress } from "./visitor-address";

/**
 * Count every request a demo's HTTP server answers — its page, its assets
 * and its API — toward its address's budget and every visitor's, and answer
 * one past either with 429, saying when to try again. A flood from one
 * address then costs the server a short refusal per request, not a page.
 *
 * @param limits - The visitors' counts
 * @returns The middleware, mounted before the page and the API
 * @example
 * ```ts
 * app.use(demoHttpGuard(limits));
 * ```
 */
export function demoHttpGuard(
  limits: DemoLimits,
  trusted: TrustedProxies = NO_TRUSTED_PROXIES,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const address = visitorAddress(
      { peer: req.socket.remoteAddress, forwardedFor: req.headers["x-forwarded-for"] },
      trusted,
    );
    const refusal = limits.take({ address }, "http");
    if (refusal === null) {
      next();
      return;
    }
    res.setHeader("Retry-After", String(DEMO_WINDOW_MS / 1000));
    res.status(429).json({ error: refusal, code: "STUDIO_DEMO_BUSY" });
  };
}
