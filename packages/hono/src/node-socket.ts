/**
 * The socket of the Node request `@hono/node-server` hands a Hono app, as
 * `env.incoming` — under `env.server` where the app's own bindings take
 * `env`, as Hono's `getConnInfo` reads it.
 *
 * @param env - The `env` Hono's context carries
 * @returns The socket, or `undefined` where the runtime is not `@hono/node-server`
 * @example
 * ```ts
 * const socket = nodeSocketOf(c.env);
 * ```
 */
export function nodeSocketOf(env: unknown): object | undefined {
  if (!isObject(env)) return undefined;
  const bindings = "server" in env && isObject(env.server) ? env.server : env;
  if (!("incoming" in bindings) || !isObject(bindings.incoming)) return undefined;
  const { incoming } = bindings;
  return "socket" in incoming && isObject(incoming.socket) ? incoming.socket : undefined;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
