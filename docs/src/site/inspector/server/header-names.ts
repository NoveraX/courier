/* The most names a list of headers, or of a header's cookies, holds. */
export const MOST_NAMES = 24

const COOKIE_NAME = /^\s*([!#$%&'*+\-.^_`|~0-9A-Za-z]+)=/
/* A cookie a `Set-Cookie` line sets, where several are written in one: at its start or after a comma. */
const SET_COOKIE_NAME = /(?:^|,)\s*([!#$%&'*+\-.^_`|~0-9A-Za-z]+)=/g

/* The names of the cookies a `Cookie` header sends. */
function sentCookies(value: string): string[] {
  return value.split(";").flatMap((pair) => COOKIE_NAME.exec(pair)?.[1] ?? [])
}

/* The names of the cookies `Set-Cookie` lines set: a cookie's attributes are not cookies. */
function setCookies(value: string): string[] {
  return [...value.matchAll(SET_COOKIE_NAME)].flatMap((match) => match[1] ?? [])
}

/* A header's name as a trace writes it: a cookie header with the names of its cookies. */
function nameOf(name: string, values: readonly string[]): string {
  const lower = name.toLowerCase()
  const cookies =
    lower === "cookie"
      ? values.flatMap(sentCookies)
      : lower === "set-cookie"
        ? values.flatMap(setCookies)
        : []
  if (cookies.length === 0) return lower
  return `${lower}(${[...new Set(cookies)].slice(0, MOST_NAMES).join(",")})`
}

/**
 * The names of headers, as a trace writes them — sorted, at most
 * {@link MOST_NAMES} — a `Cookie` or `Set-Cookie` header's with the names
 * of its cookies. No value of any header is in them.
 *
 * @param headers - The headers: a `Headers`, or a record of them as the core's events carry them
 * @returns The names, and how many past the limit were left out
 * @example
 * ```ts
 * headerNames({ cookie: "__Host-courier-demo=…", origin: "https://courier.test" })
 * // { names: ["cookie(__Host-courier-demo)", "origin"], cut: 0 }
 * ```
 */
export function headerNames(headers: Headers | Readonly<Record<string, string>>): {
  names: string[]
  cut: number
} {
  const values = new Map<string, string[]>()
  const entries = headers instanceof Headers ? [...headers] : Object.entries(headers)
  for (const [name, value] of entries) {
    const key = name.toLowerCase()
    values.set(key, [...(values.get(key) ?? []), value])
  }
  const names = [...values].map(([name, given]) => nameOf(name, given)).sort()
  return { names: names.slice(0, MOST_NAMES), cut: Math.max(0, names.length - MOST_NAMES) }
}

/**
 * What a request's body was, as a trace writes it: its media type, without
 * its parameters, and its length in bytes — `streamed` where the request
 * did not say it — or `undefined` for a request with no body.
 *
 * @param request - The request
 * @returns The body's type and length, or `undefined`
 * @example
 * ```ts
 * bodyLine(request) // "application/json 86"
 * ```
 */
export function bodyLine(request: Request): string | undefined {
  const type = request.headers.get("content-type")
  const length = request.headers.get("content-length")
  if (request.body === null && type === null && length === null) return undefined
  const media = type?.split(";")[0]?.trim().toLowerCase() || "untyped"
  const bytes = length !== null && /^\d+$/.test(length) ? length : "streamed"
  return `${media} ${bytes}`
}
