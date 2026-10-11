import { createServer } from "node:net";

/**
 * A port nothing listens on, on IPv4's loopback or IPv6's, for a server a
 * test starts. A page opened as `localhost` may reach either address, so a
 * port another process holds on IPv6's alone would send the browser to that
 * process instead of the server the test started.
 *
 * @returns The port
 * @throws {Error} When twenty ports in a row are taken on IPv6's loopback
 * @example
 * ```ts
 * const port = await freePort();
 * ```
 */
export async function freePort(): Promise<number> {
  for (let tries = 0; tries < 20; tries += 1) {
    const port = await loopbackPort();
    if (await freeOn(port, "::1")) return port;
  }
  throw new Error("No port was free on both loopback addresses");
}

/* A port the system gives out on IPv4's loopback. */
function loopbackPort(): Promise<number> {
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

/* Whether nothing holds a port on an address; an address the machine does not have, as IPv6's may be, holds nothing. */
function freeOn(port: number, host: string): Promise<boolean> {
  return new Promise((done) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => done(error.code !== "EADDRINUSE"));
    server.listen(port, host, () => server.close(() => done(true)));
  });
}
