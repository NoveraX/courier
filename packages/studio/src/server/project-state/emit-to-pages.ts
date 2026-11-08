import type { Namespace, Socket } from "socket.io";

import { toPage, toPages } from "../page-outlet";
import type { ProjectEventTarget } from "./types";

/** A page's socket: in the room of the pages with the token, or of the others. */
interface PageSocket extends ProjectEventTarget {
  readonly rooms: ReadonlySet<string>;
}

/** Every page, by the room each is in. */
interface Pages extends ProjectEventTarget {
  to(room: string): ProjectEventTarget;
}

function isPageSocket(target: ProjectEventTarget): target is PageSocket {
  return "rooms" in target && target.rooms instanceof Set;
}

function isPages(target: ProjectEventTarget): target is Pages {
  return "to" in target && typeof target.to === "function";
}

/**
 * Send an event to every page, or to the one page given, through the page
 * outlet: whole to a page that presented the project's token, as `shown`
 * to any other. A page's socket is told apart from every page's first: a
 * socket's `to` sends to the other pages, never to itself.
 *
 * @param target - Every page, or the one that connected
 * @param event - The event's name
 * @param whole - What a page with the token is sent
 * @param shown - What any other page is sent: the same, or what it may see of it
 * @example
 * ```ts
 * emitToPages(uiNamespace, "registry:updated", registry, withoutMachinePaths(registry, root));
 * ```
 */
export function emitToPages(
  target: ProjectEventTarget,
  event: string,
  whole: unknown,
  shown: unknown,
): void {
  if (isPageSocket(target)) toPage(target as unknown as Socket, event, whole, shown);
  else if (isPages(target)) toPages(target as unknown as Namespace, event, whole, shown);
  else target.emit(event, shown);
}
