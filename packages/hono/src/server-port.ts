import type { Context } from "hono";

/**
 * The port the server accepted a Hono request on, as the runtime serving
 * Hono reports it: the local port of the socket `@hono/node-server` passes
 * as `env.incoming`, or the port Bun's server listens on. Deno's handler
 * info and Cloudflare Workers report none.
 *
 * @param c - The Hono context
 * @returns The port, or `undefined` where the runtime has none
 * @example
 * ```ts
 * rememberServerPort(c.req.raw, serverPortOf(c));
 * ```
 */
export function serverPortOf(c: Context): number | undefined {
  const env: unknown = c.env;
  if (typeof env !== "object" || env === null) return undefined;
  const bindings = field(env, "server") ?? env;
  const local = field(field(field(bindings, "incoming"), "socket"), "localPort");
  if (typeof local === "number") return local;
  const listening = typeof field(env, "requestIP") === "function" ? field(env, "port") : undefined;
  return typeof listening === "number" ? listening : undefined;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}
