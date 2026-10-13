import { createLogger } from "@noverax/courier";

const log = createLogger("SvelteKit");

/**
 * The address SvelteKit's adapter reports a request came from, where it
 * reports one: `getClientAddress()` throws while a page is prerendered,
 * which has no client, and for an adapter that cannot tell.
 *
 * @param event - The request event, as a route or a hook is given it
 * @returns The address, or `undefined`
 * @example
 * ```ts
 * rememberPeerAddress(event.request, svelteKitClientAddress(event));
 * ```
 */
export function svelteKitClientAddress(event: {
  getClientAddress?: (() => string) | undefined;
}): string | undefined {
  try {
    return event.getClientAddress?.();
  } catch (error) {
    log.debug("The adapter gave no client address", error);
    return undefined;
  }
}
