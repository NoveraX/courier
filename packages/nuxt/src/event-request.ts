import { toWebRequest } from "@noverax/courier/node";

import { type H3EventLike, isWebEvent } from "./h3-event";
import { keptBodyOf } from "./kept-body";

/**
 * The Web request behind an h3 event, whichever h3 major created it.
 *
 * The request is read from the event itself rather than through h3's own
 * helpers. A package manager may resolve this adapter's `h3` to a different
 * major than the one Nitro runs — npm did exactly that in a fresh Nuxt 4
 * app — and h3 2.x's helpers read an h3 1.x event as if it carried a Web
 * request, which it does not.
 *
 * An h3 1.x event on a real Node server is converted the way every Node
 * adapter converts a request, so the request's signal also fires when the
 * client leaves mid-stream. A body that h3 or Nitro already read is taken
 * from where they kept it.
 *
 * @param event - An event from h3 1.x or 2.x
 * @returns The request to hand the Courier handler
 *
 * @example
 * ```ts
 * export default defineEventHandler(async (event) => handle(await requestOfEvent(event)));
 * ```
 */
export async function requestOfEvent(event: H3EventLike): Promise<Request> {
  if (isWebEvent(event)) return event.req;
  if (event.web?.request) return event.web.request;

  const { req, res } = event.node;
  const kept = await keptBodyOf(req);
  return toWebRequest(req, res, () => kept);
}
