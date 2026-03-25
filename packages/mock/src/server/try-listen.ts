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
 */
export function tryListen(
  serve: ServeFn,
  app: Hono,
  port: number,
  hostname: string,
  onServer: (server: ServerType) => void,
): Promise<{ port: number; url: string }> {
  const bind = hostname === "localhost" ? "0.0.0.0" : hostname;
  let attempt = 0;

  return new Promise<{ port: number; url: string }>((resolve, reject) => {
    const tryPort = (currentPort: number): void => {
      const nodeServer = serve({ fetch: app.fetch, port: currentPort, hostname: bind }, (info) => {
        onServer(nodeServer);
        resolve({ port: info.port, url: `http://localhost:${info.port}` });
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
