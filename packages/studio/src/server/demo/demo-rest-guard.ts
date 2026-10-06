/**
 * The budget a public demo gives its visitors on Studio's API.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express-serve-static-core";

import type { StudioToken } from "../studio-token";
import { TOKEN_HEADER } from "../token-guard";
import type { DemoLimits } from "./demo-limits";
import { visitorAddress } from "./visitor-address";

/** The largest body a demo's API reads: a spec pasted in, the log exported. */
export const DEMO_MAX_BODY = 16 * 1024 * 1024;

/** How many of its visitors' requests the demo's API works on at once. */
export const DEMO_REST_IN_FLIGHT = 2;

/** What a visitor is told while the API works on as many requests as it takes at once. */
export const DEMO_REST_BUSY =
  `The demo works on up to ${DEMO_REST_IN_FLIGHT} visitors' requests to its API at once. ` +
  "Try again in a moment.";

/**
 * Count each request to Studio's API from a caller without the token toward
 * its address's budget and every visitor's, and answer one past either with
 * 429 and `STUDIO_DEMO_BUSY`; so too one that arrives while the API works on
 * {@link DEMO_REST_IN_FLIGHT} of its visitors' requests. Parsing a spec of
 * several megabytes or generating its code is work every visitor waits on;
 * a caller with the token is not counted.
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
  let inFlight = 0;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== "POST" || token.matches(req.get(TOKEN_HEADER))) {
      next();
      return;
    }
    const address = visitorAddress({
      peer: req.socket.remoteAddress,
      forwardedFor: req.headers["x-forwarded-for"],
    });
    const refusal =
      inFlight >= DEMO_REST_IN_FLIGHT ? DEMO_REST_BUSY : limits.take({ address }, "rest");
    if (refusal !== null) {
      res.status(429).json({ error: refusal, code: "STUDIO_DEMO_BUSY" });
      return;
    }
    inFlight++;
    res.once("close", () => inFlight--);
    next();
  };
}
