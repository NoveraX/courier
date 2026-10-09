import { createServer } from "node:net";

/* Whether a port takes a listener on one address of this machine. */
function listens(port: number, host: string): Promise<boolean> {
  return new Promise((done) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      /* An address this machine does not have, IPv6 switched off say, holds nothing either. */
      done(error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT");
    });
    server.listen({ port, host, exclusive: true }, () => server.close(() => done(true)));
  });
}

/**
 * Whether a port is free on this machine's loopback addresses, IPv4 and
 * IPv6, where Studio and its mocks listen.
 *
 * @param port - The port
 * @returns Whether nothing listens on it
 * @example
 * ```ts
 * await isPortFree(6280); // false while a Studio runs
 * ```
 */
export async function isPortFree(port: number): Promise<boolean> {
  return (await listens(port, "127.0.0.1")) && (await listens(port, "::1"));
}

/**
 * The first free port from one on: the default, unless something listens
 * there — another project's Studio, say.
 *
 * @param from - The port to try first
 * @param tries - How many ports to try
 * @returns The port, or `from` when none of them is free
 * @example
 * ```ts
 * await firstFreePort(7001); // 7002 while a mock runs on 7001
 * ```
 */
export async function firstFreePort(from: number, tries = 50): Promise<number> {
  for (let port = from; port < from + tries; port++) {
    if (await isPortFree(port)) return port;
  }
  return from;
}
