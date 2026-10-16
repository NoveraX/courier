import { STUDIO_PASS_HEADER } from "@noverax/courier/internal";
import { issueStudioPass } from "./studio-passes";

/**
 * The header carrying a fresh one-time pass for a Playground call through
 * the app's proxy route — none in a browser, which needs none.
 *
 * @param requestId - The request Studio shows the call under
 * @returns The pass's header, or no headers
 * @example
 * ```ts
 * const headers = { ...withoutPassHeader(call.headers), ...passHeaders(requestId) };
 * ```
 */
export function passHeaders(requestId: string): Record<string, string> {
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
