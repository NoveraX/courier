import type { Context } from "hono";

/**
 * The remote address of the connection a Hono request arrived on, as the
 * runtime serving Hono reports it.
 *
 * A Web `Request` carries no peer address, and each runtime puts it
 * somewhere else — the same places Hono's own `getConnInfo` helpers read:
 * `@hono/node-server` passes the Node request as `env.incoming`, Bun's
 * server answers `requestIP()`, and Deno's handler info has `remoteAddr`.
 * A runtime that reports none — Cloudflare Workers — leaves the caller to
 * the proxy headers it sets.
 *
 * @param c - The Hono context of the upgrade request
 * @returns The peer's address, or `undefined` where the runtime has none
 *
 * @example
 * ```ts
 * wsHandler.handleSocket(socket, c.req.raw, peerAddressOf(c));
 * ```
 */
export function peerAddressOf(c: Context): string | undefined {
  const env: unknown = c.env;
  if (typeof env !== "object" || env === null) return undefined;
  return nodeAddress(env) ?? bunAddress(env, c.req.raw) ?? denoAddress(env);
}

/** `@hono/node-server`: the socket of the Node request it hands over. */
function nodeAddress(env: object): string | undefined {
  const bindings = "server" in env && isObject(env.server) ? env.server : env;
  if (!("incoming" in bindings) || !isObject(bindings.incoming)) return undefined;
  const { incoming } = bindings;
  if (!("socket" in incoming) || !isObject(incoming.socket)) return undefined;
  const { socket } = incoming;
  return "remoteAddress" in socket ? stringOrUndefined(socket.remoteAddress) : undefined;
}

/** Bun: the server passed as `env` answers `requestIP(request)`. */
function bunAddress(env: object, request: Request): string | undefined {
  if (!("requestIP" in env) || typeof env.requestIP !== "function") return undefined;
  const info: unknown = env.requestIP(request);
  if (!isObject(info) || !("address" in info)) return undefined;
  return stringOrUndefined(info.address);
}

/** Deno: the handler info passed as `env` carries `remoteAddr`. */
function denoAddress(env: object): string | undefined {
  if (!("remoteAddr" in env) || !isObject(env.remoteAddr)) return undefined;
  const { remoteAddr } = env;
  return "hostname" in remoteAddr ? stringOrUndefined(remoteAddr.hostname) : undefined;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
