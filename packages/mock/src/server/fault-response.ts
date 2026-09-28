import { Socket } from "node:net";

import type { Context as HonoContext } from "hono";

import { createFaultError } from "../network/failure";
import type { NetworkConfig } from "../types";

/** How long a `timeout` fault holds a request when the config sets no `timeout` */
export const DEFAULT_FAULT_TIMEOUT_MS = 30_000;

/**
 * Fail a request the way a simulated network fault does.
 *
 * - `"timeout"` holds the request for the config's `timeout` (30 s unless
 *   set), or until the client gives up, and then answers 408. A client whose
 *   own timeout is shorter sees it fire, as it would against a server that
 *   never answers.
 * - `"reset"` drops the connection without an answer, so the client sees a
 *   failed request rather than an HTTP status. A request that did not arrive
 *   over a socket — one passed to `app.request()` — is answered 502 instead.
 * - A status code (`"500"`, `"503"`, …) is answered at once with that status.
 *
 * `record` is called once the fault has run its course, with the status and
 * message the fault stands for, so the history and hooks get its real duration.
 *
 * @param c - The request's Hono context
 * @param fault - The fault picked for this request
 * @param network - The network config in effect for the request
 * @param record - Records the failed request
 * @returns The response to send, which a dropped connection never delivers
 * @example
 * ```ts
 * if (netConfig && shouldFail(netConfig)) {
 *   return answerFault(c, pickFault(netConfig), netConfig, (status, message) => log(status, message));
 * }
 * ```
 */
export async function answerFault(
  c: HonoContext,
  fault: string,
  network: NetworkConfig,
  record: (status: number, message: string) => void,
): Promise<Response> {
  const { status, message } = createFaultError(fault);
  if (fault === "timeout") {
    await holdFor(network.timeout ?? DEFAULT_FAULT_TIMEOUT_MS, c.req.raw.signal);
  }
  record(status, message);

  const socket = fault === "reset" ? socketOf(c.env) : undefined;
  if (socket) {
    socket.destroy();
    return new Response(null);
  }
  return c.json({ error: message }, status as 500);
}

/** Wait `ms`, or less when `signal` aborts first */
function holdFor(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/** The socket a request arrived on, from the bindings `@hono/node-server` passes */
function socketOf(env: unknown): Socket | undefined {
  if (typeof env !== "object" || env === null || !("incoming" in env)) return undefined;
  const { incoming } = env;
  const hasSocket = typeof incoming === "object" && incoming !== null && "socket" in incoming;
  return hasSocket && incoming.socket instanceof Socket ? incoming.socket : undefined;
}
