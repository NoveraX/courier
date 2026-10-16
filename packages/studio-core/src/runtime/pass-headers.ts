import { getAppOrigin } from "@noverax/courier";
import { isLoopbackHostname, STUDIO_PASS_HEADER } from "@noverax/courier/internal";

import { issueStudioPass } from "./studio-passes";

/**
 * The header carrying a fresh one-time pass for a Playground call through
 * the app's proxy route — none in a browser, which needs none, and none to
 * a route on any origin but this machine's own names or the app's origin,
 * as config or the environment set it or as the server itself told it:
 * only the process serving the route could redeem it, and anywhere else it
 * would stay alive and unspent until the call ends. No request header
 * decides the app's origin, so none decides where a pass goes.
 *
 * @param requestId - The request Studio shows the call under
 * @param target - The proxy route's address, as the call reaches it
 * @returns The pass's header, or no headers
 * @example
 * ```ts
 * const headers = { ...withoutPassHeader(call.headers), ...passHeaders(requestId, "http://localhost:3000/api/request") };
 * ```
 */
export function passHeaders(requestId: string, target: string | undefined): Record<string, string> {
  if (!servedByApp(target)) return {};
  const pass = issueStudioPass(requestId);
  return pass === undefined ? {} : { [STUDIO_PASS_HEADER]: pass };
}

/**
 * The headers the Playground was given, short of a pass header in any
 * spelling: only the runtime puts one on a call, and one written beside it
 * would join it into a value no pass has.
 *
 * @param headers - The headers as the Playground sent them
 * @returns The same headers, with no pass header
 * @example
 * ```ts
 * withoutPassHeader({ "X-Courier-Studio-Pass": "x", accept: "*" }); // → { accept: "*" }
 * ```
 */
export function withoutPassHeader(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== STUDIO_PASS_HEADER),
  );
}

function servedByApp(target: string | undefined): boolean {
  const url = target === undefined ? undefined : urlOf(target);
  if (url === undefined) return false;
  if (isLoopbackHostname(url.hostname)) return true;
  const app = getAppOrigin();
  return app !== undefined && urlOf(app)?.origin === url.origin;
}

function urlOf(address: string): URL | undefined {
  return URL.canParse(address) ? new URL(address) : undefined;
}
