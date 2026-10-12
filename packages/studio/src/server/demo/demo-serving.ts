/**
 * What serving Studio as a public demo adds to its servers.
 */

import type { Server, ServerOptions } from "node:http";

import type { RequestHandler } from "express-serve-static-core";

import type { StudioSocketOptions } from "../socket-server";
import type { StudioDemo } from "../types";
import type { VisitorPolicy } from "../ui-token-guard";
import { createDemoConnections } from "./demo-connections";
import { demoHttpGuard } from "./demo-http-guard";
import { createDemoLimits, type DemoLimits } from "./demo-limits";
import { DEMO_MAX_MESSAGE_BYTES, type DemoVisitorsDeps, demoVisitors } from "./demo-visitors";
import { type TrustedProxies, trustedProxies } from "./trusted-proxies";

/**
 * How long a demo's HTTP server waits for what a connection is sending —
 * the headers of a request, and the whole of it, a spec of 16 MB pasted
 * over a slow line included — and how often it looks. Node's defaults gave
 * a connection that sent a byte now and then a minute for its headers and
 * five for the request, looked at every thirty seconds.
 */
export const DEMO_SERVER_OPTIONS = {
  headersTimeout: 10_000,
  requestTimeout: 120_000,
  connectionsCheckingInterval: 2_000,
} as const satisfies ServerOptions;

/** How many connections a demo's HTTP server holds at once; one past it is closed as it opens. */
export const DEMO_MAX_CONNECTIONS = 1000;

/**
 * How much of each log a demo's page is sent as it connects: the newest
 * requests, a few hundred, rather than the 16 MB a developer's page gets.
 * Each page that connects is sent its own copy, so a crowd connecting at
 * once costs the demo this much for each.
 */
export const DEMO_REPLAY_BYTES = 2 * 1024 * 1024;

/** A public demo's counts, the guard on its HTTP server, how its sockets take messages, and its visitors' rule. */
export interface DemoServing {
  limits: DemoLimits;
  /** The proxies a visitor's address is read past in `X-Forwarded-For`. */
  trusted: TrustedProxies;
  httpGuard: RequestHandler;
  sockets: StudioSocketOptions;
  /** The rule a page without the token is held to, counted with the rest. */
  visitors(deps: Omit<DemoVisitorsDeps, "limits" | "trusted">): VisitorPolicy;
  /** The options the HTTP server is made with: its timeouts. */
  serverOptions: ServerOptions;
  /** Hold the HTTP server to the demo's connection count. */
  holdServer(server: Server): void;
}

/**
 * The guards a public demo serves its visitors with: one count of what they
 * do, on the sockets, the API and every HTTP request alike, each visitor by
 * the address the proxies in front of the demo report; sockets that
 * compress, take smaller messages and are counted by address.
 *
 * @param demo - How the demo runs: the proxies it is reached through, and the header they name a visitor in
 * @returns What the demo adds to Studio's servers
 * @throws {CourierError} `STUDIO_DEMO_PROXY_INVALID` for a trusted proxy that is no address or range
 * @example
 * ```ts
 * const serving = demo ? demoServing(demo) : undefined;
 * if (serving) app.use(serving.httpGuard);
 * ```
 */
export function demoServing(demo: StudioDemo = {}): DemoServing {
  const limits = createDemoLimits();
  const trusted = trustedProxies(demo.trustedProxies, demo.addressHeader);
  return {
    limits,
    trusted,
    httpGuard: demoHttpGuard(limits, trusted),
    sockets: {
      maxMessageBytes: DEMO_MAX_MESSAGE_BYTES,
      compress: true,
      connections: createDemoConnections(limits, trusted),
    },
    visitors: (deps) => demoVisitors({ ...deps, limits, trusted }),
    serverOptions: DEMO_SERVER_OPTIONS,
    holdServer(server) {
      server.maxConnections = DEMO_MAX_CONNECTIONS;
    },
  };
}
