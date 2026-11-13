/** The browser's store of a page's cookies, as the Cookie Store API lets the page ask it. */
interface PageCookieStore {
  getAll(): Promise<unknown>;
}

/**
 * The cookies a page's script can read, by name, as the browser keeps
 * them: listed by the store `cookieStore` asks, rather than read from the
 * page's copy of them in `document.cookie`, which WebKit brings up to date
 * only after an answer that set a cookie reaches the page. The first of a
 * name wins, as in `document.cookie`, which lists them in the same order.
 *
 * @returns The cookies by name; `undefined` outside a page, where the browser gives the page no store, or where the store lists something else
 * @throws What the store failed with
 * @example
 * ```ts
 * const jar = (await storedCookies()) ?? cookieJarOf(document.cookie);
 * ```
 */
export async function storedCookies(): Promise<Map<string, string> | undefined> {
  const store = pageCookieStore();
  if (store === undefined) return undefined;
  const cookies: unknown = await store.getAll();
  if (!Array.isArray(cookies)) return undefined;
  const jar = new Map<string, string>();
  for (const cookie of cookies as unknown[]) {
    if (typeof cookie !== "object" || cookie === null) continue;
    const name: unknown = Reflect.get(cookie, "name");
    const value: unknown = Reflect.get(cookie, "value");
    if (typeof name !== "string" || name === "" || typeof value !== "string") continue;
    if (!jar.has(name)) jar.set(name, value);
  }
  return jar;
}

/* The store a page can ask for its cookies: none outside a page — React Native has no document —
   nor where the browser gives the page none. */
function pageCookieStore(): PageCookieStore | undefined {
  if (!Object.hasOwn(globalThis, "document")) return undefined;
  const store: unknown = Reflect.get(globalThis, "cookieStore");
  if (typeof store !== "object" || store === null) return undefined;
  return typeof Reflect.get(store, "getAll") === "function"
    ? (store as PageCookieStore)
    : undefined;
}
