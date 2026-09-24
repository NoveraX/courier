import { createServer } from "node:net";
import type { ServerType } from "@hono/node-server";
import type { Hono } from "hono";

type ServeFn = (
  options: { fetch: Hono["fetch"]; port: number; hostname: string },
  callback: (info: { port: number }) => void,
) => ServerType;

const MAX_RETRIES = 100;

/**
 * Whether another process listens on `port` on the IPv6 loopback. Dev servers
 * asked for `localhost` often bind only `[::1]`, which a bind on 127.0.0.1
 * does not collide with — yet `http://localhost:PORT` reaches them first.
 */
function heldOnIpv6Loopback(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", (err: NodeJS.ErrnoException) => resolve(err.code === "EADDRINUSE"));
    probe.once("listening", () => probe.close(() => resolve(false)));
    probe.listen({ port, host: "::1", ipv6Only: true });
  });
}

function addressInUse(port: number): NodeJS.ErrnoException {
  return Object.assign(new Error(`listen EADDRINUSE: address already in use [::1]:${port}`), {
    code: "EADDRINUSE",
    port,
  });
}

/**
 * Try to start a Hono server on `port`, retrying on EADDRINUSE
 * by incrementing the port up to `retries` times — none for a port the
 * caller must have exactly.
 *
 * `localhost` listens on the loopback address only; a port already held on
 * `[::1]` counts as taken, since the URL reported for it would reach that
 * other server. Pass `0.0.0.0` to reach the server from another machine or a
 * container.
 */
export function tryListen(
  serve: ServeFn,
  app: Hono,
  port: number,
  hostname: string,
  onServer: (server: ServerType) => void,
  retries: number = MAX_RETRIES,
): Promise<{ port: number; url: string }> {
  const bind = hostname === "localhost" ? "127.0.0.1" : hostname;
  const wildcard = hostname === "0.0.0.0" || hostname === "::";
  const shown = wildcard ? "localhost" : hostname.includes(":") ? `[${hostname}]` : hostname;
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
      if (
        hostname === "localhost" &&
        currentPort !== 0 &&
        (await heldOnIpv6Loopback(currentPort))
      ) {
        retryOrFail(addressInUse(currentPort), currentPort);
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
