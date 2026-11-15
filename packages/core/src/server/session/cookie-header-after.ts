import { cookieHeaderOf, parseCookieHeader } from "../../session/cookie-header";
import { isDeletion, type SetCookie } from "../../session/set-cookie";

/**
 * A request's `Cookie` header once the API has set the given cookies, as
 * the calls made for the request see them: each replaces every cookie of
 * its name the header had, the last of a name winning, and one that
 * deletes its name leaves none. The others stay as they were sent, in their
 * order, before the ones set.
 *
 * @param header - The request's `Cookie` header, or nothing
 * @param cookies - The cookies the API set, in the order it set them
 * @returns The header's value; `""` for none
 * @example
 * ```ts
 * cookieHeaderAfter("sid=old; theme=dark", [{ name: "sid", value: "new" }]); // "theme=dark; sid=new"
 * ```
 */
export function cookieHeaderAfter(
  header: string | null | undefined,
  cookies: readonly SetCookie[],
): string {
  const latest = new Map(cookies.map((cookie) => [cookie.name, cookie]));
  const kept = parseCookieHeader(header).filter(({ name }) => !latest.has(name));
  const set = [...latest.values()].filter((cookie) => !isDeletion(cookie));
  return cookieHeaderOf([...kept, ...set]);
}
