import type { PlatformFetch } from "../../http-client/source-transport";

/**
 * The fetch each hop of a call kept within its request's origin is sent
 * with, as a page's bundle has it: none, as a browser follows a redirect
 * itself, keeping a request's credentials to its own rules, and answers one
 * it was told to leave alone with nothing to read. Only React Native's
 * networking follows a redirect wherever it leads, and the app's bundler
 * builds for the `react-native` condition and takes the server's module,
 * which refuses what it would follow so; a bundler that builds for the
 * browser takes this one.
 *
 * @param _send - The fetch the call goes with
 * @param _body - What the call sends
 * @returns `undefined`
 * @example
 * ```ts
 * const within = keptWithinOrigin(send, body);
 * return within ? fetchWithinOrigin(url, init, within) : send(url, init);
 * ```
 */
export function keptWithinOrigin(_send: PlatformFetch, _body: unknown): undefined {
  return undefined;
}
