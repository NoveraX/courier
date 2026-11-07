/** The connection a request came on, as the runtime serving TanStack Start tells it. */
export interface Connection {
  /** The Node socket, where the request was built from Node's own */
  readonly socket: object | undefined;
  /** The address of the client at the other end */
  readonly address: string | undefined;
}

/**
 * The connection a request TanStack Start serves came on. Its dev server,
 * `vite preview` and Nitro build each request with srvx, which keeps
 * Node's own request on `runtime.node.req`: its socket tells the client's
 * address and where the server listens. On the runtimes srvx serves
 * without Node — Bun, Deno — it tells the client's address as `ip`, where
 * TanStack Start's own `getRequestIP` reads it. Under Node the socket is
 * believed over `ip`, which srvx takes from `X-Forwarded-For` when told to
 * trust a proxy: the chain a proxy recorded is read by the core's rules,
 * as every adapter's is.
 *
 * @param request - The request a route or a middleware is given
 * @returns The socket, where there is one, and the client's address
 * @example
 * ```ts
 * connectionOf(request).address; // → "127.0.0.1"
 * ```
 */
export function connectionOf(request: Request): Connection {
  const socket = objectOr(field(field(field(request, "runtime"), "node"), "req"), "socket");
  const address = socket === undefined ? field(request, "ip") : field(socket, "remoteAddress");
  return { socket, address: typeof address === "string" && address !== "" ? address : undefined };
}

function objectOr(value: unknown, key: string): object | undefined {
  const found = field(value, key);
  return typeof found === "object" && found !== null ? found : undefined;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}
