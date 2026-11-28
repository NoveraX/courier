import { ConfigurationError } from "../errors/configuration-error";
import type { PlatformFetch } from "../http-client/source-transport";
import { answersWhole } from "./answers-whole";
import { inBrowserPage } from "./browser-page";
import { holdsDeviceFiles } from "./device-files";
import { isReactNative } from "./is-react-native";
import { parseUrl } from "./parse-url";

const OWN_FETCH =
  "React Native's own `fetch` follows every redirect itself, wherever it leads, so a call kept within its origin, with `withinOrigin`, cannot go with it. Send the call with `expo/fetch`, which hands a redirect over when told to, or without `withinOrigin`.";

const DEVICE_FILE =
  "A form naming a file on the device goes only through React Native's XMLHttpRequest, which follows every redirect itself, so a call kept within its origin, with `withinOrigin`, cannot send one. Send the file's bytes, as a `Blob`, or the call without `withinOrigin`.";

const FOLLOWED =
  "The `fetch` this call went with followed a redirect to another origin itself, as React Native's own does, so the call's credentials may have gone there too; a call kept within its origin, with `withinOrigin`, cannot go with it. Send the call with a `fetch` that hands a redirect over when told to, as `expo/fetch` does.";

/**
 * The fetch each hop of a call kept within its request's origin is sent
 * with, as `fetchWithinOrigin` follows them — or none where the platform's
 * fetch follows a redirect itself, as a browser's page's does, keeping a
 * request's credentials to the browser's own rules.
 *
 * Courier keeps a call within its origin by sending it with `redirect:
 * "manual"` and following itself each redirect that stays there, as Node's,
 * Deno's, Bun's and an edge worker's fetch let it. React Native's networking
 * follows every redirect, whatever a request says: its XMLHttpRequest, and
 * React Native's own fetch, the whatwg-fetch polyfill built on it, which
 * drops `redirect` — on Android on to another host with every header the
 * call carries but `Authorization`. Of an app's fetches, expo/fetch alone
 * hands a redirect over. So in an app such a call never goes through
 * XMLHttpRequest; one that would go with React Native's own fetch, or that
 * sends a form naming a file on the device, which XMLHttpRequest alone
 * sends, is refused before it is sent; and through a fetch of the app's
 * own, which may send with React Native's, an answer from another origin
 * than its hop was sent to is refused rather than read as the API's.
 *
 * @param send - The fetch the call goes with
 * @param body - What the call sends
 * @returns What sends each hop, or `undefined` where the platform follows redirects itself
 * @throws {ConfigurationError} `WITHIN_ORIGIN_UNAVAILABLE`, in an app, for a call it cannot keep within its origin
 * @example
 * ```ts
 * const within = keptWithinOrigin(send, body);
 * return within ? fetchWithinOrigin(url, init, within) : send(url, init);
 * ```
 */
export function keptWithinOrigin(send: PlatformFetch, body: unknown): PlatformFetch | undefined {
  if (inBrowserPage()) return undefined;
  if (!isReactNative()) return send;
  if (answersWhole(send)) throw unavailable(OWN_FETCH);
  if (holdsDeviceFiles(body)) throw unavailable(DEVICE_FILE);
  return async (url, init) => {
    const response = await send(url, init);
    if (answeredFrom(response, url)) return response;
    await response.body?.cancel();
    throw unavailable(FOLLOWED);
  };
}

/* Whether an answer came from the origin its hop was sent to: one that names no address of its
   own says nothing else. */
function answeredFrom(response: Response, url: string): boolean {
  if (!response.url) return true;
  return parseUrl(response.url)?.origin === parseUrl(url)?.origin;
}

function unavailable(message: string): ConfigurationError {
  return new ConfigurationError("WITHIN_ORIGIN_UNAVAILABLE", message);
}
