/**
 * The cookie a visitor's own data is kept under. The backend sets it with
 * their first change and reads it back from every call; the site's
 * sources name it as their `session`, so Courier carries it between the
 * browser and the backend, and no other cookie of the site reaches it.
 * `__Host-` keeps it to the site's own host, over HTTPS, for every path.
 */
export const VISITOR_COOKIE = "__Host-courier-demo"

/* The id the store makes: 16 random bytes, in base64url. */
const VISITOR_ID = /^[A-Za-z0-9_-]{22}$/

/**
 * The visitor a call's cookies name: the value of the visitor's cookie,
 * when it has the form of an id the backend makes.
 *
 * @param cookies - The call's `Cookie` header
 * @returns The visitor's id, or `undefined` for a call that names none
 * @example
 * ```ts
 * visitorIn("theme=dark; __Host-courier-demo=q3Hf0k2LZp9xW1vB7tYc4A") // "q3Hf0k2LZp9xW1vB7tYc4A"
 * ```
 */
export function visitorIn(cookies: string | undefined): string | undefined {
  for (const pair of cookies?.split(";") ?? []) {
    const at = pair.indexOf("=")
    if (at === -1 || pair.slice(0, at).trim() !== VISITOR_COOKIE) continue
    const value = pair.slice(at + 1).trim()
    return VISITOR_ID.test(value) ? value : undefined
  }
  return undefined
}

/**
 * The `Set-Cookie` header that hands a visitor their id: for the whole
 * site, over HTTPS alone, out of the page's scripts' reach, sent along by
 * the site's own requests only, and for as long as the backend keeps
 * their data at most.
 *
 * @param visitor - The visitor's id
 * @param lifetimeMs - How long the backend keeps a visitor's data at most
 * @returns The header's value
 * @example
 * ```ts
 * visitorCookie(visitor, 7_200_000)
 * // "__Host-courier-demo=…; Path=/; Max-Age=7200; Secure; HttpOnly; SameSite=Lax"
 * ```
 */
export function visitorCookie(visitor: string, lifetimeMs: number): string {
  const maxAge = Math.floor(lifetimeMs / 1000)
  return `${VISITOR_COOKIE}=${visitor}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`
}
