/** The attributes of a cookie the browser acts on, as `Set-Cookie` names them. */
export interface CookieAttributes {
  domain?: string | undefined;
  path?: string | undefined;
  /** As the header wrote it: browsers read many date forms, and it is passed on as written */
  expires?: string | undefined;
  maxAge?: number | undefined;
  secure?: boolean | undefined;
  httpOnly?: boolean | undefined;
  sameSite?: "Strict" | "Lax" | "None" | undefined;
  partitioned?: boolean | undefined;
  priority?: "Low" | "Medium" | "High" | undefined;
}

/** One cookie a `Set-Cookie` header sets, or deletes. */
export interface SetCookie extends CookieAttributes {
  name: string;
  /** As the header carried it, undecoded: the API reads back exactly what it wrote */
  value: string;
}

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it refuses
const CONTROL = /[\u0000-\u001f\u007f]/;
const SAME_SITE: ReadonlyMap<string, CookieAttributes["sameSite"]> = new Map([
  ["strict", "Strict"],
  ["lax", "Lax"],
  ["none", "None"],
]);
const PRIORITY: ReadonlyMap<string, CookieAttributes["priority"]> = new Map([
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
]);

/**
 * The cookie a `Set-Cookie` header sets, read as RFC 6265 reads it. A header
 * whose name is not a token, or whose value holds a control character, sets
 * nothing that can be passed on. Attributes a browser does not know, and
 * malformed ones, are left out.
 *
 * @param header - One `Set-Cookie` header
 * @returns The cookie, or `undefined` when the header sets none
 * @example
 * ```ts
 * parseSetCookie("sid=a1; Path=/; HttpOnly; SameSite=lax");
 * // { name: "sid", value: "a1", path: "/", httpOnly: true, sameSite: "Lax" }
 * ```
 */
export function parseSetCookie(header: string): SetCookie | undefined {
  const [pair = "", ...attributes] = header.split(";");
  const at = pair.indexOf("=");
  if (at <= 0) return undefined;
  const name = pair.slice(0, at).trim();
  const value = pair.slice(at + 1).trim();
  if (!TOKEN.test(name) || CONTROL.test(value)) return undefined;

  const cookie: SetCookie = { name, value };
  for (const attribute of attributes) readAttribute(cookie, attribute);
  return cookie;
}

function readAttribute(cookie: SetCookie, attribute: string): void {
  const at = attribute.indexOf("=");
  const key = (at < 0 ? attribute : attribute.slice(0, at)).trim().toLowerCase();
  const value = at < 0 ? "" : attribute.slice(at + 1).trim();
  if (CONTROL.test(value)) return;
  if (key === "secure") cookie.secure = true;
  else if (key === "httponly") cookie.httpOnly = true;
  else if (key === "partitioned") cookie.partitioned = true;
  else if (key === "path") cookie.path = value.startsWith("/") ? value : undefined;
  else if (key === "domain") cookie.domain = domainOf(value);
  else if (key === "max-age") cookie.maxAge = /^-?\d+$/.test(value) ? Number(value) : undefined;
  else if (key === "expires") cookie.expires = Number.isNaN(Date.parse(value)) ? undefined : value;
  else if (key === "samesite") cookie.sameSite = SAME_SITE.get(value.toLowerCase());
  else if (key === "priority") cookie.priority = PRIORITY.get(value.toLowerCase());
}

/* A leading dot is ignored, as browsers ignore it; an empty domain is none. */
function domainOf(value: string): string | undefined {
  const domain = value.replace(/^\./, "").toLowerCase();
  return domain === "" ? undefined : domain;
}

/**
 * The `Set-Cookie` header that sets a cookie, its attributes in a fixed order.
 *
 * @param cookie - The cookie
 * @returns The header's value
 * @example
 * ```ts
 * serializeSetCookie({ name: "sid", value: "a1", path: "/", secure: true });
 * // "sid=a1; Path=/; Secure"
 * ```
 */
export function serializeSetCookie(cookie: SetCookie): string {
  const parts = [`${cookie.name}=${cookie.value}`];
  if (cookie.domain !== undefined) parts.push(`Domain=${cookie.domain}`);
  if (cookie.path !== undefined) parts.push(`Path=${cookie.path}`);
  if (cookie.expires !== undefined) parts.push(`Expires=${cookie.expires}`);
  if (cookie.maxAge !== undefined) parts.push(`Max-Age=${cookie.maxAge}`);
  if (cookie.secure) parts.push("Secure");
  if (cookie.httpOnly) parts.push("HttpOnly");
  if (cookie.sameSite !== undefined) parts.push(`SameSite=${cookie.sameSite}`);
  if (cookie.partitioned) parts.push("Partitioned");
  if (cookie.priority !== undefined) parts.push(`Priority=${cookie.priority}`);
  return parts.join("; ");
}

/**
 * Whether a cookie deletes the one of its name rather than setting it: it
 * has run out of time the moment it arrives.
 *
 * @param cookie - The cookie
 * @param now - The current time, in milliseconds
 * @returns `true` for a deletion
 * @example
 * ```ts
 * isDeletion({ name: "sid", value: "", maxAge: 0 }); // true
 * ```
 */
export function isDeletion(cookie: SetCookie, now: number = Date.now()): boolean {
  if (cookie.maxAge !== undefined) return cookie.maxAge <= 0;
  return cookie.expires !== undefined && Date.parse(cookie.expires) <= now;
}
