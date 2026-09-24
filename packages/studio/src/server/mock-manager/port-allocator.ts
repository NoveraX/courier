import { createServer } from "node:net";

const SEARCH_SPAN = 100;

/* A port counts as free only when it is free on both loopbacks: dev servers
   asked for `localhost` often bind only [::1], and http://localhost:PORT
   would reach them rather than the mock. A system without IPv6 has nothing
   listening there. */
function isFreeOn(port: number, host: "127.0.0.1" | "::1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (err: NodeJS.ErrnoException) =>
      resolve(host === "::1" && err.code !== "EADDRINUSE"),
    );
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen({ port, host, ipv6Only: host === "::1" });
  });
}

async function isPortAvailable(port: number): Promise<boolean> {
  return (await isFreeOn(port, "127.0.0.1")) && (await isFreeOn(port, "::1"));
}

/**
 * Find a free port for a mock Studio assigns one to.
 *
 * @param preferred - The port to try first; the next ones follow
 * @param avoid - Ports held for other mocks, skipped even when free
 * @returns The first free port not in `avoid`
 * @throws When none of the next ports is free
 */
export async function allocatePort(preferred: number, avoid: ReadonlySet<number>): Promise<number> {
  for (let port = preferred; port < preferred + SEARCH_SPAN; port++) {
    if (avoid.has(port)) continue;
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No free port from ${preferred} to ${preferred + SEARCH_SPAN - 1}.`);
}
