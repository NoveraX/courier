import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  adoptListenOrigin,
  DEV_SERVER_ORIGIN_ENV,
  type ServerOrigin,
  serverOriginOf,
} from "@noverax/courier/internal";

/* Listening on every interface names no address to call: this machine's own is one of them. */
const ANY_INTERFACE: ReadonlySet<string> = new Set(["0.0.0.0", "::"]);

/**
 * Tell the app where its dev server listens, the moment it starts: the app
 * in this process adopts it, and a worker the process starts finds it in
 * the environment — Nuxt serves from one. The Playground sends its calls
 * there; the address comes from the listening server itself, so no request
 * decides it. A developer's `COURIER_APP_URL` still wins.
 *
 * @param address - What the listening server's `address()` returned
 * @param encrypted - Whether the server speaks TLS
 * @example
 * ```ts
 * httpServer.once("listening", () => shareDevServerOrigin(httpServer.address(), false));
 * ```
 */
export function shareDevServerOrigin(
  address: AddressInfo | string | null,
  encrypted: boolean,
): void {
  if (address === null || typeof address === "string") return;
  const localAddress = ANY_INTERFACE.has(address.address) ? "127.0.0.1" : address.address;
  share(serverOriginOf({ localAddress, localPort: address.port, encrypted }));
}

/**
 * Tell the app where its own server listens, where that server runs Vite in
 * middleware mode — as React Router's custom server does — and so Vite
 * listens on nothing: the socket of the first request the server hands Vite
 * tells its address and port, whatever the request names.
 *
 * @returns A Connect middleware for `server.middlewares`
 * @example
 * ```ts
 * if (!server.httpServer) server.middlewares.use(shareFirstRequestOrigin());
 * ```
 */
export function shareFirstRequestOrigin(): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void {
  let told = false;
  return (req, _res, next) => {
    if (!told) {
      told = true;
      share(serverOriginOf(req.socket));
    }
    next();
  };
}

function share(source: ServerOrigin | undefined): void {
  if (source === undefined) return;
  process.env[DEV_SERVER_ORIGIN_ENV] ??= source.serverOrigin;
  adoptListenOrigin(source.serverOrigin);
}
