import type { ServerType } from "@hono/node-server";
import type { Hono } from "hono";

import { answeringAddress } from "./answering-address";

type ServeFn = (
  options: { fetch: Hono["fetch"]; port: number; hostname: string },
  callback: (info: { port: number }) => void,
) => ServerType;

const MAX_RETRIES = 100;

const LOOPBACKS: readonly string[] = ["127.0.0.1", "::1"];
const WILDCARDS: ReadonlySet<string> = new Set(["0.0.0.0", "::"]);

/* Where clients of the server connect: `localhost` resolves to either
   loopback, and a server on every address is reported as `localhost`. */
function reachedAt(hostname: string): readonly string[] {
  return hostname === "localhost" || WILDCARDS.has(hostname) ? LOOPBACKS : [hostname];
}

/* An IPv6 address as a URL or an error message writes it. */
function bracketed(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

function addressInUse(host: string, port: number): NodeJS.ErrnoException {
  const message = `listen EADDRINUSE: address already in use ${bracketed(host)}:${port}`;
  return Object.assign(new Error(message), { code: "EADDRINUSE", port });
}

/**
 * Try to start a Hono server on `port`, retrying on EADDRINUSE
 * by incrementing the port up to `retries` times — none for a port the
 * caller must have exactly.
 *
 * `localhost` listens on the loopback address only. A port another process
 * already answers on where the server's clients connect — either loopback,
 * for `localhost` and every address — counts as taken, even when the bind
 * itself would succeed beside that process: the URL reported would reach it,
 * or the two would share the port. Pass `0.0.0.0` to reach the server from
 * another machine or a container.
 *
 * @param serve - `serve` from `@hono/node-server`
 * @param app - The Hono app to serve
 * @param port - The port to try first; `0` lets the system pick one
 * @param hostname - Where to listen; `localhost` means loopback only
 * @param onServer - Receives the Node server once it listens
 * @param retries - How many ports above `port` to try when it is taken
 * @param avoid - Ports the search passes over without trying them: ones other servers were given
 * @returns The port listened on and the URL to reach it at
 * @throws The listen error, EADDRINUSE included once no retry is left
 *
 * @example
 * ```ts
 * const { serve } = await import("@hono/node-server");
 * // Rejects with EADDRINUSE while another process answers at localhost:7001
 * const { url } = await tryListen(serve, app, 7001, "localhost", () => undefined, 0);
 * ```
 */
export function tryListen(
  serve: ServeFn,
  app: Hono,
  port: number,
  hostname: string,
  onServer: (server: ServerType) => void,
  retries: number = MAX_RETRIES,
  avoid: ReadonlySet<number> = new Set(),
): Promise<{ port: number; url: string }> {
  const bind = hostname === "localhost" ? "127.0.0.1" : hostname;
  const shown = WILDCARDS.has(hostname) ? "localhost" : bracketed(hostname);
  let attempt = 0;

  return new Promise<{ port: number; url: string }>((resolve, reject) => {
    const retryOrFail = (err: NodeJS.ErrnoException, currentPort: number): void => {
      if (err.code === "EADDRINUSE" && attempt < retries) {
        attempt++;
        void tryPort(currentPort + 1);
      } else {
        reject(err);
      }
    };

    const tryPort = async (currentPort: number): Promise<void> => {
      /* A port given to another server is skipped while searching, never when it is the one asked for. */
      if (attempt > 0 && avoid.has(currentPort) && attempt < retries) {
        attempt++;
        void tryPort(currentPort + 1);
        return;
      }
      const answering =
        currentPort === 0 ? null : await answeringAddress(currentPort, reachedAt(hostname));
      if (answering !== null) {
        retryOrFail(addressInUse(answering, currentPort), currentPort);
        return;
      }
      const nodeServer = serve({ fetch: app.fetch, port: currentPort, hostname: bind }, (info) => {
        onServer(nodeServer);
        resolve({ port: info.port, url: `http://${shown}:${info.port}` });
      });

      // @hono/node-server returns a Node http.Server — listen for errors
      nodeServer.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") nodeServer.close();
        retryOrFail(err, currentPort);
      });
    };

    void tryPort(port);
  });
}
