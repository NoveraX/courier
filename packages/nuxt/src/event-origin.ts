import { type ServerOrigin, serverOriginOf } from "@noverax/courier/internal";

import type { H3EventLike } from "./h3-event";

/**
 * Where the Nitro server listens, as the Node socket under an h3 event tells
 * it — h3 1.x keeps the Node request on `event.node`, h3 2.x on the web
 * request's `runtime.node`. Under `nuxt dev` the request reaches Nitro's
 * worker on an internal channel whose socket tells no address: Studio's Nuxt
 * module names the dev server there.
 *
 * @param event - The h3 event
 * @returns The server's origin, or `undefined` where the socket tells none
 * @example
 * ```ts
 * announce(serverOriginOfEvent(event));
 * ```
 */
export function serverOriginOfEvent(event: H3EventLike): ServerOrigin | undefined {
  const node = field(event, "node") ?? field(field(field(event, "req"), "runtime"), "node");
  return serverOriginOf(field(field(node, "req"), "socket"));
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}
