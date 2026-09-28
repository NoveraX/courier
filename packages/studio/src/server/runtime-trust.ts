import type { Socket } from "socket.io";

import { isPlainObject } from "./is-plain-object";
import type { StudioToken } from "./studio-token";

/* Kept by socket rather than by runtime id: when a runtime's socket goes, its
   id passes to another socket under it, which has to have shown the token too. */
const trusted = new WeakSet<Socket>();

/**
 * Trust a runtime socket that presented this project's Studio token when it
 * connected. A server runtime reads the token from `.courier/studio-token`
 * beside `courier.config`; a browser runtime never has it. Only a trusted
 * runtime is sent Playground calls, with the headers typed into them.
 *
 * @param socket - A socket just connected to `/runtime`
 * @param token - This project's Studio token
 * @returns Whether the socket presented the token
 *
 * @example
 * ```ts
 * runtimeNamespace.on("connection", (socket) => admitRuntimeSocket(socket, token));
 * ```
 */
export function admitRuntimeSocket(socket: Socket, token: StudioToken): boolean {
  const auth: unknown = socket.handshake.auth;
  if (!token.matches(isPlainObject(auth) ? auth.token : undefined)) return false;
  trusted.add(socket);
  return true;
}

/**
 * Whether a runtime socket presented this project's Studio token.
 *
 * @param socket - A runtime socket
 * @returns Whether Studio may send it Playground calls
 *
 * @example
 * ```ts
 * if (!isTrustedRuntime(entry.socket)) return { refusal: UNTRUSTED };
 * ```
 */
export function isTrustedRuntime(socket: Socket): boolean {
  return trusted.has(socket);
}
