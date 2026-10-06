import { createServer } from "node:net";

/**
 * A port nothing listens on now, for a server a test starts.
 *
 * @returns The port
 * @example
 * ```ts
 * const port = await freePort();
 * ```
 */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}
