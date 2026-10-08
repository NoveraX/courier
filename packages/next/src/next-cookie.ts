import type { RelayedCookie } from "@noverax/courier";

/** A cookie as Next.js's `cookies().set()` and a response's `cookies.set()` take it. */
export interface NextCookie {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  expires?: Date;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
  partitioned?: boolean;
  priority?: "low" | "medium" | "high";
}

/**
 * A cookie the API set, as Next.js's cookie API takes it — or nothing when
 * it cannot: Next.js URL-encodes a value it writes, so only a value
 * `encodeURIComponent` gives back exactly arrives as the API sent it.
 *
 * @param relayed - The cookie, made for the application's origin
 * @returns The cookie for Next.js, or `undefined` when its value would arrive changed
 * @example
 * ```ts
 * nextCookieOf(relayed); // { name: "csrftoken", value: "t1", path: "/", secure: true, httpOnly: false }
 * ```
 */
export function nextCookieOf({ cookie }: RelayedCookie): NextCookie | undefined {
  const value = decodedExactly(cookie.value);
  if (value === undefined) return undefined;
  return {
    name: cookie.name,
    value,
    path: cookie.path ?? "/",
    ...(cookie.domain !== undefined && { domain: cookie.domain }),
    ...(cookie.expires !== undefined && { expires: new Date(cookie.expires) }),
    ...(cookie.maxAge !== undefined && { maxAge: cookie.maxAge }),
    secure: cookie.secure === true,
    httpOnly: cookie.httpOnly === true,
    ...(cookie.sameSite !== undefined && { sameSite: lower(cookie.sameSite) }),
    ...(cookie.partitioned && { partitioned: true }),
    ...(cookie.priority !== undefined && { priority: lower(cookie.priority) }),
  };
}

/* The value `encodeURIComponent` turns back into exactly the one the API sent, if one does. */
function decodedExactly(raw: string): string | undefined {
  try {
    const decoded = decodeURIComponent(raw);
    return encodeURIComponent(decoded) === raw ? decoded : undefined;
  } catch {
    /* A `%` that starts no escape: no decoded value encodes back to it. */
    return undefined;
  }
}

function lower<TValue extends string>(value: TValue): Lowercase<TValue> {
  return value.toLowerCase() as Lowercase<TValue>;
}
