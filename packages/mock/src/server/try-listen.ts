import type { ServerType } from "@hono/node-server";
import type { Hono } from "hono";

type ServeFn = (
  options: { fetch: Hono["fetch"]; port: number; hostname: string },
  callback: (info: { port: number }) => void,
) => ServerType;

const MAX_RETRIES = 100;

/**
 * Try to start a Hono server on `port`, retrying on EADDRINUSE
 * by incrementing the port up to MAX_RETRIES times.
 *
 * `localhost` listens on the loopback address only. It used to mean every
 * interface, so the unauthenticated admin API — the whole store, reset,
 * scenario switches — was open to anyone on the same network. Pass
 * `0.0.0.0` to reach the server from another machine or a container.
 */
export function tryListen(
  serve: ServeFn,
  app: Hono,
  port: number,
  hostname: string,
  onServer: (server: ServerType) => void,
): Promise<{ port: number; url: string }> {
  const bind = hostname === "localhost" ? "127.0.0.1" : hostname;
  const wildcard = hostname === "0.0.0.0" || hostname === "::";
  const shown = wildcard ? "localhost" : hostname.includes(":") ? `[${hostname}]` : hostname;
  let attempt = 0;

  return new Promise<{ port: number; url: string }>((resolve, reject) => {
    const tryPort = (currentPort: number): void => {
      const nodeServer = serve({ fetch: app.fetch, port: currentPort, hostname: bind }, (info) => {
        onServer(nodeServer);
        resolve({ port: info.port, url: `http://${shown}:${info.port}` });
      });

      // @hono/node-server returns a Node http.Server — listen for errors
      nodeServer.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && attempt < MAX_RETRIES) {
          attempt++;
          nodeServer.close();
          tryPort(currentPort + 1);
        } else {
          reject(err);
        }
      });
    };

    tryPort(port);
  });
}
