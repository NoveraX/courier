/* A scheme makes an address of its own; the token is the API's to hand out. */
const SCHEME = /^[a-z][a-z\d+.-]*:/i;
/* What a bare path cannot hold: spaces and control characters, a query, a
   fragment, or a parameter the call for it has no variables to fill. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it refuses
const NOT_A_PATH = /[\s\u0000-\u001f\u007f?#:]/;
const ORIGIN = /^(https?:\/\/[^/?#]+)/i;

/**
 * Why `csrf.from` cannot name where the API hands its token out, when it
 * cannot: it is a bare path, under the API's address or from its origin's
 * root, never an address of its own.
 *
 * @param from - What `csrf.from` was given
 * @returns The problem, or `undefined` for none
 * @example
 * ```ts
 * csrfSourceProblem("https://other.example.com/csrf"); // "… names an address of its own …"
 * ```
 */
export function csrfSourceProblem(from: unknown): string | undefined {
  if (from === undefined) return undefined;
  if (typeof from !== "string" || from === "") return 'is a path, such as "/sanctum/csrf-cookie"';
  if (SCHEME.test(from) || from.startsWith("//")) {
    return `${JSON.stringify(from)} names an address of its own: the token is the API's, so name its path, such as "/sanctum/csrf-cookie"`;
  }
  if (NOT_A_PATH.test(from)) {
    return `${JSON.stringify(from)} is a bare path: no spaces, query, fragment or path parameter`;
  }
  return undefined;
}

/**
 * Where a call for the token goes: a path without a leading `/` lies under
 * the API's `baseURL`, as an endpoint's does; one with it, at the root of
 * the API's origin — or the page's, for an API a page reaches by a path.
 *
 * @param from - The checked `csrf.from`
 * @param baseURL - The API's address
 * @returns What the API's client is asked for, or `undefined` when no origin is known
 * @example
 * ```ts
 * csrfSource("/sanctum/csrf-cookie", "https://app.example.com/api");
 * // "https://app.example.com/sanctum/csrf-cookie"
 * ```
 */
export function csrfSource(from: string, baseURL: string | undefined): string | undefined {
  if (!from.startsWith("/")) return from;
  const origin = ORIGIN.exec(baseURL ?? "")?.[1] ?? pageOrigin();
  return origin === undefined ? undefined : `${origin}${from}`;
}

function pageOrigin(): string | undefined {
  const location: unknown = Reflect.get(globalThis, "location");
  const origin: unknown =
    typeof location === "object" && location !== null ? Reflect.get(location, "origin") : undefined;
  return typeof origin === "string" && ORIGIN.test(origin) ? origin : undefined;
}
