import { createLogger } from "@noverax/courier";

const log = createLogger("Astro");

/**
 * The address Astro's adapter reports a request came from, where it reports
 * one: Astro throws for a page built ahead of time, which has no client,
 * and for an adapter that cannot tell.
 *
 * @param context - The request's context, as an endpoint or a middleware is given it
 * @returns The address, or `undefined`
 * @example
 * ```ts
 * rememberPeerAddress(context.request, astroClientAddress(context));
 * ```
 */
export function astroClientAddress(context: {
  readonly clientAddress?: string;
}): string | undefined {
  try {
    return context.clientAddress;
  } catch (error) {
    log.debug("The adapter gave no client address", error);
    return undefined;
  }
}
