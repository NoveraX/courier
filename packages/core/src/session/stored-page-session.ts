import { browserSession } from "./browser-session";
import type { CallSession } from "./call-session";
import { overSecureTransport } from "./one-user-transport";
import type { SessionTarget } from "./session-target";

/** The browser's store of a page's cookies, as the Cookie Store API lets the page ask it. */
interface PageCookieStore {
  getAll(): Promise<unknown>;
}

/**
 * A call's session in a browser's page, read from the cookies the browser
 * keeps, which `cookieStore` lists, rather than from the page's copy of
 * them in `document.cookie`: for a write whose double-submit token was
 * just asked for. WebKit hands a page its cookies from such a copy, which
 * a cookie an answer set reaches only after the answer reaches the page;
 * read at once, the copy shows no token yet, and the write would go
 * without it. The store keeps the cookie before the page has the answer.
 *
 * @param target - The call, as the session reads it
 * @returns The session the store's cookies give it; `undefined` outside a page, where the page has no store — one served over plain HTTP, or by a browser without it — or where the store fails
 * @example
 * ```ts
 * const found = (await storedPageSession(target)) ?? reread;
 * ```
 */
export async function storedPageSession(target: SessionTarget): Promise<CallSession | undefined> {
  const session = target.session;
  const store = pageCookieStore();
  if (session === undefined || store === undefined) return undefined;
  let cookies: unknown;
  try {
    cookies = await store.getAll();
  } catch {
    return undefined;
  }
  const jar = storedJar(cookies);
  return jar === undefined
    ? undefined
    : overSecureTransport(target, browserSession(target, session, jar));
}

/* The cookies the store listed, by name, the first of a name winning as in `document.cookie`,
   which lists them in the same order; nothing for a list that is none. */
function storedJar(cookies: unknown): Map<string, string> | undefined {
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
