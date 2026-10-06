/**
 * What serving Studio as a public demo adds to its servers.
 */

import type { RequestHandler } from "express-serve-static-core";

import type { StudioSocketOptions } from "../socket-server";
import type { VisitorPolicy } from "../ui-token-guard";
import { createDemoConnections } from "./demo-connections";
import { demoHttpGuard } from "./demo-http-guard";
import { createDemoLimits, type DemoLimits } from "./demo-limits";
import { DEMO_MAX_MESSAGE_BYTES, type DemoVisitorsDeps, demoVisitors } from "./demo-visitors";

/** A public demo's counts, the guard on its HTTP server, how its sockets take messages, and its visitors' rule. */
export interface DemoServing {
  limits: DemoLimits;
  httpGuard: RequestHandler;
  sockets: StudioSocketOptions;
  /** The rule a page without the token is held to, counted with the rest. */
  visitors(deps: Omit<DemoVisitorsDeps, "limits">): VisitorPolicy;
}

/**
 * The guards a public demo serves its visitors with: one count of what they
 * do, on the sockets, the API and every HTTP request alike; sockets that
 * compress, take smaller messages and are counted by address.
 *
 * @returns What the demo adds to Studio's servers
 * @example
 * ```ts
 * const serving = demo ? demoServing() : undefined;
 * if (serving) app.use(serving.httpGuard);
 * ```
 */
export function demoServing(): DemoServing {
  const limits = createDemoLimits();
  return {
    limits,
    httpGuard: demoHttpGuard(limits),
    sockets: {
      maxMessageBytes: DEMO_MAX_MESSAGE_BYTES,
      compress: true,
      connections: createDemoConnections(),
    },
    visitors: (deps) => demoVisitors({ ...deps, limits }),
  };
}
