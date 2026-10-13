/**
 * The budget a public demo gives its visitors on Studio's API.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express-serve-static-core";

import { type RequestWork, requestWork } from "../request-work";
import type { StudioToken } from "../studio-token";
import { TOKEN_HEADER } from "../token-guard";
import type { DemoLimits } from "./demo-limits";
import { dropWhenQuiet } from "./drop-when-quiet";
import { NO_TRUSTED_PROXIES, type TrustedProxies } from "./trusted-proxies";
import { visitorAddress } from "./visitor-address";

/** The largest body a demo's API reads: a spec pasted in, the log exported. */
export const DEMO_MAX_BODY = 16 * 1024 * 1024;

/**
 * The largest specification, as JSON, the demo reads for a visitor: one the
 * visitor can send back to have its code generated, with room beside it in
 * that body for the generator's options and the endpoints picked.
 */
export const DEMO_MAX_SPEC = DEMO_MAX_BODY - 1024 * 1024;

/**
 * The body past which a visitor's request is work every visitor waits on —
 * read on Studio's thread, then read as a specification, its code generated
 * or the log turned into a file — and counted while it runs. A request with
 * a body of unknown length counts too; the Studio page's everyday requests
 * carry a few bytes.
 */
export const DEMO_LARGE_BODY = 256 * 1024;

/** How many of its visitors' large requests the demo's API works on at once. */
export const DEMO_REST_IN_FLIGHT = 2;

/** How many large requests from one address the demo's API works on at once. */
export const DEMO_REST_PER_ADDRESS = 1;

/**
 * How long a visitor's connection may make no progress while it is the
 * visitor's turn: sending its request's body, or reading the answer. Node
 * takes a write that moved on since it last looked as progress, so an
 * answer a visitor stops reading is dropped within twice this.
 */
export const DEMO_IDLE_MS = 10_000;

/** What a visitor is told while the API works on as many large requests as it takes at once. */
export const DEMO_REST_BUSY =
  `The demo works on up to ${DEMO_REST_IN_FLIGHT} visitors' large requests to its API at once — a specification read, its code generated, a log exported. ` +
  "Try again in a moment.";

/** What a visitor is told while the API works on a large request from the same address. */
export const DEMO_REST_ADDRESS_BUSY =
  "The demo works on one large request to its API at a time from each address — a specification read, its code generated, a log exported — and one from yours is under way. " +
  "Try again once it is answered.";

/**
 * Count each request to Studio's API from a caller without the token that
 * sends something — a POST, or any request with a body — toward its
 * address's budget and every visitor's, and answer one past either with 429
 * and `STUDIO_DEMO_BUSY`; so too a large one, with a body past
 * {@link DEMO_LARGE_BODY}, that arrives while the API works on
 * {@link DEMO_REST_IN_FLIGHT} of its visitors' large requests, or on one from
 * the same address. Parsing a spec of several megabytes or generating its
 * code is work every visitor waits on; the Studio page's everyday requests
 * are not, and are counted by their rate alone. A caller with the token is
 * not counted.
 *
 * A large request counts among every visitor's until the work it set going
 * has ended and its route has written its answer — even once its visitor
 * has hung up, which tells that work to stop — and among its address's until
 * that answer has been sent. A visitor whose connection
 * makes no progress for `idleMs` on its turn, sending its body or reading
 * the answer, is dropped, so neither a body that stops arriving nor an
 * answer never read keeps a place; a body that trickles in keeps one no
 * longer than the server's request timeout.
 *
 * @param token - The project's token
 * @param limits - The visitors' counts
 * @param trusted - The proxies a visitor's address is read past
 * @param idleMs - How long a visitor's connection may make no progress on its turn (default {@link DEMO_IDLE_MS})
 * @returns The middleware, mounted on `/api` before the routes
 * @example
 * ```ts
 * app.use("/api", demoRestGuard(token, limits));
 * ```
 */
export function demoRestGuard(
  token: StudioToken,
  limits: DemoLimits,
  trusted: TrustedProxies = NO_TRUSTED_PROXIES,
  idleMs: number = DEMO_IDLE_MS,
): RequestHandler {
  const places = createRestPlaces();
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!(req.method === "POST" || bodyLength(req) > 0) || token.matches(req.get(TOKEN_HEADER))) {
      next();
      return;
    }
    const address = visitorAddress(
      { peer: req.socket.remoteAddress, headers: req.headers },
      trusted,
    );
    const large = bodyLength(req) > DEMO_LARGE_BODY;
    const refusal = (large ? places.refusal(address) : null) ?? limits.take({ address }, "rest");
    if (refusal !== null) {
      res.status(429).json({ error: refusal, code: "STUDIO_DEMO_BUSY" });
      return;
    }
    if (large) places.hold(address, requestWork(res));
    dropWhenQuiet(req, res, idleMs);
    next();
  };
}

/** The requests the API works on, for every visitor and for each address. */
interface RestPlaces {
  refusal(address: string): string | null;
  hold(address: string, work: RequestWork): void;
}

function createRestPlaces(): RestPlaces {
  let inFlight = 0;
  const byAddress = new Map<string, number>();
  return {
    refusal(address) {
      if ((byAddress.get(address) ?? 0) >= DEMO_REST_PER_ADDRESS) return DEMO_REST_ADDRESS_BUSY;
      return inFlight >= DEMO_REST_IN_FLIGHT ? DEMO_REST_BUSY : null;
    },
    hold(address, work) {
      inFlight++;
      byAddress.set(address, (byAddress.get(address) ?? 0) + 1);
      void work.handedOver.then(() => inFlight--);
      void work.ended.then(() => {
        const left = (byAddress.get(address) ?? 1) - 1;
        if (left > 0) byAddress.set(address, left);
        else byAddress.delete(address);
      });
    },
  };
}

/* A body's length as the request gives it; one sent in chunks is of unknown length, taken as the largest. */
function bodyLength(req: Request): number {
  if (req.headers["transfer-encoding"] !== undefined) return Number.POSITIVE_INFINITY;
  const length = Number(req.headers["content-length"] ?? 0);
  return Number.isFinite(length) && length > 0 ? length : 0;
}
