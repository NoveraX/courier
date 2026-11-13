/**
 * `@noverax/courier/announce` — what a framework adapter tells Studio of
 * what it hosts, without depending on `studio-core`: the announcement
 * buffer Studio's runtime drains (`studio/announcements`), and the
 * announcement an adapter makes once sources are registered.
 */

import { getAppOrigin } from "../app-origin";
import type { Sources } from "../define/types";
import { discoverAppOrigin, type ServerOrigin } from "../discover-app-origin";
import { getSources, onSourcesChange } from "../registered-sources";
import { type AnnounceHostingInput, announceHosting } from "../studio/announcements";

export {
  type AnnounceHostingInput,
  announceHosting,
  type BufferedAnnouncement,
  consumeAnnouncements,
  type RuntimeTransport,
} from "../studio/announcements";

/**
 * Announce what an adapter hosts as soon as sources are registered, without
 * requiring them when the adapter's handler is created.
 *
 * Call the returned function on each request, with where the server itself
 * listens when the adapter can tell — the socket the request arrived on, or
 * the framework's own address. It announces on the first call that finds
 * the registry populated, and once more when the app's origin is learned
 * after that — in development — so Studio shows where the app runs and its
 * Playground sends there; otherwise it does nothing. Before sources are
 * registered it does nothing and never throws, so a handler created at
 * module load works whenever `registerSources()` or `attachRuntime()` runs.
 * A request that arrives before any registration is answered by the
 * handler itself, which names the missing registry.
 *
 * Reading the registry once, as the factory ran, broke real setups: `next
 * build` evaluates every route module long before any `register()` hook, and
 * a Hono or Express app may mount its routes before awaiting
 * `attachRuntime()`. The adapter therefore announces as soon as sources are
 * registered — at once when they already are, or when they come — so Studio
 * knows which runtime serves them before the app has had a single request,
 * and the Playground can send to a freshly started app.
 *
 * @param input - What the adapter hosts, without the sources
 * @returns A function to call on each request, with where the server
 *   listens when the adapter can tell, which may teach the app its origin
 *   (see `discoverAppOrigin`)
 *
 * @example
 * ```ts
 * const announce = announceWhenRegistered({ transports: ["http"], framework: "hono" });
 * return (c) => {
 *   announce(serverOriginOf(c.env.incoming?.socket));
 *   return handle(c.req.raw);
 * };
 * ```
 */
export function announceWhenRegistered(
  input: Omit<AnnounceHostingInput, "sources">,
): (source?: ServerOrigin | string) => void {
  /* The origin the last announcement carried, or `null` before the first. */
  let announcedWith: string | undefined | null = null;
  let stopWaiting: (() => void) | undefined;
  const announce = (sources: Sources | undefined): void => {
    if (!sources) return;
    const origin = input.listenOrigin ?? getAppOrigin();
    if (announcedWith !== null && (announcedWith !== undefined || origin === undefined)) return;
    if (announcedWith === null) stopWaiting?.();
    announcedWith = origin;
    announceHosting({
      ...input,
      ...(origin !== undefined && { listenOrigin: origin }),
      sources: Object.values(sources),
    });
  };
  stopWaiting = onSourcesChange(announce);
  announce(getSources());
  return (source) => {
    discoverAppOrigin(source);
    announce(getSources());
  };
}
