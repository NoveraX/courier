import { isCredentialHeader } from "../utils/is-credential-header";

const HIDDEN = "[redacted]";

/**
 * A response's headers as an error prints them: every one, with what a
 * credential's value says hidden — a cookie the API set keeps its name and
 * attributes, an `Authorization` its scheme — so a log line tells what was
 * sent without handing on the user's session.
 *
 * @param headers - The headers
 * @returns Them by name, a `Set-Cookie` repeated as a list
 * @example
 * ```ts
 * shownHeaders(new Headers({ "set-cookie": "sid=a1; Path=/; HttpOnly" }));
 * // { "set-cookie": ["sid=[redacted]; Path=/; HttpOnly"] }
 * ```
 */
export function shownHeaders(headers: Headers): Record<string, string | string[]> {
  const shown: Record<string, string | string[]> = {};
  headers.forEach((value, name) => {
    if (name !== "set-cookie") shown[name] = isCredentialHeader(name) ? hidden(name, value) : value;
  });
  const cookies = setCookiesShown(headers);
  if (cookies !== undefined) shown["set-cookie"] = cookies;
  return shown;
}

function setCookiesShown(headers: Headers): string[] | undefined {
  if (typeof headers.getSetCookie === "function") {
    const listed = headers.getSetCookie();
    return listed.length > 0 ? listed.map(cookieShown) : undefined;
  }
  /* React Native's Headers has no getSetCookie and joins the cookies into one value, hidden whole. */
  return headers.has("set-cookie") ? [HIDDEN] : undefined;
}

function hidden(name: string, value: string): string {
  if (name !== "authorization" && name !== "proxy-authorization") return HIDDEN;
  const scheme = value.trim().split(/\s+/, 1)[0];
  return scheme && scheme !== value.trim() ? `${scheme} ${HIDDEN}` : HIDDEN;
}

/* `sid=a1; Path=/` → `sid=[redacted]; Path=/`: which cookie, and how, without its value. */
function cookieShown(header: string): string {
  const [pair = "", ...attributes] = header.split(";");
  const at = pair.indexOf("=");
  const name = at > 0 ? pair.slice(0, at).trim() : "";
  return [name ? `${name}=${HIDDEN}` : HIDDEN, ...attributes.map((part) => part.trim())].join("; ");
}
