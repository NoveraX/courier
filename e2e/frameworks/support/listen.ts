import type { Server } from "node:http";

/** A server the checks run, and how to stop it. */
export interface Served {
  url: string;
  close(): Promise<void>;
}

/**
 * Serve on a free port of the loopback address.
 *
 * @param server - The server
 * @returns Its address and how to close it
 * @example
 * ```ts
 * const api = await listen(createServer(handler));
 * ```
 */
export function listen(server: Server): Promise<Served> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}
