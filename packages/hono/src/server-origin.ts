import { type ServerOrigin, serverOriginOf } from "@noverax/courier/internal";
import type { Context } from "hono";

import { nodeSocketOf } from "./node-socket";

/* Names Bun gives a server reached on this machine: every interface, of which this machine's
   loopback is one, or `localhost` itself. */
const THIS_MACHINE: ReadonlySet<string> = new Set(["0.0.0.0", "::", "localhost"]);

/**
 * Where the server serving a Hono app listens, as its runtime tells it: the
 * socket `@hono/node-server` hands over as `env.incoming`, or the address
 * Bun's server listens on. Deno's handler info and Cloudflare Workers tell
 * none.
 *
 * @param c - The Hono context
 * @returns The server's origin, or `undefined` where the runtime tells none
 * @example
 * ```ts
 * announce(serverOriginOfHono(c)); // → { serverOrigin: "http://localhost:3000" }
 * ```
 */
export function serverOriginOfHono(c: Context): ServerOrigin | undefined {
  const env: unknown = c.env;
  if (typeof env !== "object" || env === null) return undefined;
  const socket = nodeSocketOf(env);
  return socket === undefined ? bunOrigin(env) : serverOriginOf(socket);
}

/* Bun's server: the one that answers `requestIP()` names the address it listens on. */
function bunOrigin(server: object): ServerOrigin | undefined {
  if (typeof field(server, "requestIP") !== "function") return undefined;
  const url = field(server, "url");
  if (!(url instanceof URL)) return undefined;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const encrypted = url.protocol === "https:";
  return serverOriginOf({
    localAddress: THIS_MACHINE.has(host) ? "127.0.0.1" : host,
    localPort: url.port ? Number(url.port) : encrypted ? 443 : 80,
    encrypted,
  });
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}
