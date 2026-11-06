import { studioHooksHere } from "../capabilities/studio-hooks";
import { isDevelopment } from "../utils/development";

/**
 * Tell Studio an API was defined, in development: a hot-reloaded module
 * runs `defineApi()` again, and Studio registers the config's sources anew
 * so they follow the application's edits. A page's bundle takes a stand-in
 * that tells nothing, since a page runs no Studio.
 *
 * @param api - The API just defined
 * @param baseURL - Its address, as its definition gave it
 * @example
 * ```ts
 * announceSource(api, "https://api.example.com");
 * ```
 */
export function announceSource(api: unknown, baseURL: string): void {
  if (isDevelopment()) studioHooksHere().onSourceDefined?.(api, baseURL);
}
