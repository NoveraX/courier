import { defineOwn } from "../define-own";
import { cutSecrets } from "./cut-text";
import { REDACTED } from "./redacted";
import { isSecretHeader } from "./secret-name";

/**
 * A response's headers as an error prints them: every one, with what a
 * credential's value says hidden — a cookie the API set keeps its name and
 * attributes, an `Authorization` its scheme — so a log line tells what was
 * sent without handing on the user's session. A header's name reads its
 * value as a record's field or an address's parameter of that name does,
 * too: `sid`, `x-otp`; and a value its name keeps is read as a text, as a
 * field's string is.
 *
 * @param headers - The headers
 * @returns Them by name, a `Set-Cookie` repeated as a list
 * @example
 * ```ts
 * headersWithoutSecrets(new Headers({ "set-cookie": "sid=a1; Path=/; HttpOnly" }));
 * // { "set-cookie": ["sid=[redacted]; Path=/; HttpOnly"] }
 * ```
 */
export function headersWithoutSecrets(headers: Headers): Record<string, string | string[]> {
  const shown: Record<string, string | string[]> = {};
  headers.forEach((value, name) => {
    if (name !== "set-cookie") defineOwn(shown, name, shownValue(name, value));
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
  return headers.has("set-cookie") ? [REDACTED] : undefined;
}

/* A header its name keeps is read as a text is: an address in a `Location` or a `Link` loses its secrets. */
function shownValue(name: string, value: string): string {
  return isSecretHeader(name, value) ? hidden(name, value) : cutSecrets(value);
}

function hidden(name: string, value: string): string {
  if (name !== "authorization" && name !== "proxy-authorization") return REDACTED;
  const scheme = value.trim().split(/\s+/, 1)[0];
  return scheme && scheme !== value.trim() ? `${scheme} ${REDACTED}` : REDACTED;
}

/* `sid=a1; Path=/` → `sid=[redacted]; Path=/`: which cookie, and how, without its value. */
function cookieShown(header: string): string {
  const [pair = "", ...attributes] = header.split(";");
  const at = pair.indexOf("=");
  const name = at > 0 ? pair.slice(0, at).trim() : "";
  return [name ? `${name}=${REDACTED}` : REDACTED, ...attributes.map((part) => part.trim())].join(
    "; ",
  );
}
