import { createServer } from "node:net";

/** Why a mock could not listen on a port, or `null` when it could. */
export type PortProblem = "in use" | "not permitted" | null;

/* A port counts as free only when it is free on both loopbacks: dev servers
   asked for `localhost` often bind only [::1], and http://localhost:PORT
   would reach them rather than the mock. A system without IPv6 has nothing
   listening there. */
function problemOn(port: number, host: "127.0.0.1" | "::1"): Promise<PortProblem> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") resolve("in use");
      else if (err.code === "EACCES") resolve("not permitted");
      else resolve(host === "::1" ? null : "in use");
    });
    server.once("listening", () => server.close(() => resolve(null)));
    server.listen({ port, host, ipv6Only: host === "::1" });
  });
}

/**
 * Why a mock could not listen on a port now, on either loopback: another
 * process holds it, or it is a privileged port this process may not bind.
 *
 * @param port - The port to try
 * @returns The problem, or `null` when both loopbacks let Studio bind it
 */
export async function portProblem(port: number): Promise<PortProblem> {
  return (await problemOn(port, "127.0.0.1")) ?? (await problemOn(port, "::1"));
}
