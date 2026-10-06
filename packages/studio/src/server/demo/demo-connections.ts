/**
 * How many sockets a public demo keeps open for each visitor's address and
 * for every visitor together.
 */

import type { IncomingMessage } from "node:http";

import type { DemoLimits } from "./demo-limits";
import { type VisitorConnection, visitorAddress } from "./visitor-address";

/** How many sockets one address, and every visitor together, may hold open at once. */
export const DEMO_CONNECTIONS = { address: 10, all: 200 } as const;

/** A socket the demo counts until it closes: the request that opened it, and its close. */
export interface CountedSocket {
  request: IncomingMessage;
  once(event: "close", listener: () => void): unknown;
}

/** The sockets a demo's visitors hold open. */
export interface DemoConnections {
  /** Whether a socket may open for this request: refused past either count. */
  admits(request: IncomingMessage): boolean;
  /** Count a socket that opened, until it closes. */
  count(socket: CountedSocket): void;
}

/**
 * The sockets a demo's visitors hold open, counted from the moment each
 * opens until it closes. A visitor past its address's share — pages and
 * sockets opened by a script, say — is refused a new one; every visitor is,
 * once the demo holds as many as it serves. Each socket that opens is also
 * counted toward the address's and every visitor's `connect` budget, since
 * each is sent the logs as it connects. The demo's own runtimes count
 * toward this machine's address, a handful of sockets.
 *
 * @param limits - The visitors' counts, which take each socket that opens
 * @returns Empty counts
 * @example
 * ```ts
 * const connections = createDemoConnections();
 * new Server(httpServer, { allowRequest: (req, done) => done(null, connections.admits(req)) });
 * io.engine.on("connection", (socket) => connections.count(socket));
 * ```
 */
export function createDemoConnections(limits: DemoLimits): DemoConnections {
  const open = new Map<string, number>();
  let total = 0;
  return {
    admits(request) {
      const address = visitorAddress(connectionOf(request));
      const held = open.get(address) ?? 0;
      if (held >= DEMO_CONNECTIONS.address || total >= DEMO_CONNECTIONS.all) return false;
      return limits.take({ address }, "connect") === null;
    },
    count(socket) {
      const address = visitorAddress(connectionOf(socket.request));
      open.set(address, (open.get(address) ?? 0) + 1);
      total++;
      socket.once("close", () => {
        const held = (open.get(address) ?? 1) - 1;
        if (held > 0) open.set(address, held);
        else open.delete(address);
        total--;
      });
    },
  };
}

function connectionOf(request: IncomingMessage): VisitorConnection {
  return { peer: request.socket.remoteAddress, forwardedFor: request.headers["x-forwarded-for"] };
}
