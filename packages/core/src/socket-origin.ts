import type { ServerOrigin } from "./discover-app-origin";

/* This machine's usual loopback addresses, named as a development certificate names them. */
const LOCALHOST: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Where a server listens, as the socket it accepted a request on tells: the
 * socket's local address and port, and `https` when it is encrypted.
 *
 * Nothing the request sends decides it, so calls sent there reach this very
 * server — behind a reverse proxy, through a tunnel or inside a container
 * alike. `127.0.0.1` and `::1` are named `localhost`, as a development
 * certificate names them; an IPv4 address in IPv6 form is written as IPv4.
 * It runs on any runtime: it reads only the fields a Node socket has.
 *
 * @param socket - The request's socket, as a Node server hands it over
 * @returns The server's origin, or `undefined` where the socket tells no address, as on a UNIX socket
 * @example
 * ```ts
 * announce(serverOriginOf(req.socket)); // → { serverOrigin: "http://localhost:3000" }
 * ```
 */
export function serverOriginOf(socket: unknown): ServerOrigin | undefined {
  const address = field(socket, "localAddress");
  const port = field(socket, "localPort");
  if (typeof address !== "string" || typeof port !== "number" || port <= 0) return undefined;
  if (address === "" || address.includes("%")) return undefined;
  const scheme = field(socket, "encrypted") === true ? "https" : "http";
  return { serverOrigin: `${scheme}://${hostOf(address.toLowerCase())}:${port}` };
}

function hostOf(address: string): string {
  if (LOCALHOST.has(address)) return "localhost";
  const ip = address.startsWith("::ffff:") && address.includes(".") ? address.slice(7) : address;
  return ip.includes(":") ? `[${ip}]` : ip;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}
