/**
 * The token this page presents for Studio to make changes.
 *
 * Studio prints a link carrying it, `http://localhost:6280/#token=…`. The page
 * takes it from the fragment — which no request carries — keeps it for its
 * next visits, and takes it out of the address bar, so a copied address or a
 * screenshot does not hand it on. A page opened without it reads everything
 * and changes nothing.
 */

/** The header Studio reads the token from. */
export const TOKEN_HEADER = "x-courier-studio-token";

/** Where the page keeps the token for its next visits. */
export const TOKEN_STORAGE_KEY = "courier-studio-token";

/* 32 random bytes, base64url, as Studio makes them. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

let current: string | null | undefined;

const arrivals = new Set<(token: string) => void>();

/**
 * The page's token: the one its link carried, or the one kept from an
 * earlier visit. The first call takes it out of the address bar, so the
 * page calls this before its router reads the address.
 *
 * @returns The token, or `null` when the page has none
 * @example
 * ```ts
 * const token = studioToken();
 * if (token) headers[TOKEN_HEADER] = token;
 * ```
 */
export function studioToken(): string | null {
  if (current !== undefined) return current;
  current = fromLink() ?? kept();
  /* A link opened in a page already showing Studio changes only its
     fragment, so the page is not loaded again to read it. */
  addEventListener("hashchange", arrived);
  return current;
}

/**
 * Be told when a link opened in this page, after it loaded, brings a token
 * other than the page's.
 *
 * @param listener - Called with the new token, once it is the page's
 * @returns A function that stops telling the listener
 * @example
 * ```ts
 * onTokenArrival(() => socket.disconnect().connect());
 * ```
 */
export function onTokenArrival(listener: (token: string) => void): () => void {
  arrivals.add(listener);
  return () => {
    arrivals.delete(listener);
  };
}

/**
 * The headers a request to Studio carries the token in.
 *
 * @returns The token's header, or none when the page has no token
 * @example
 * ```ts
 * await apiClient.post(url, { json: body, headers: tokenHeaders() });
 * ```
 */
export function tokenHeaders(): Record<string, string> {
  const token = studioToken();
  return token ? { [TOKEN_HEADER]: token } : {};
}

function fromLink(): string | null {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const token = fragment.get("token");
  if (token === null || !TOKEN.test(token)) return null;
  keep(token);
  fragment.delete("token");
  const rest = fragment.toString();
  history.replaceState(history.state, "", `${location.pathname}${location.search}${rest ? `#${rest}` : ""}`);
  return token;
}

function arrived(): void {
  const token = fromLink();
  if (token === null || token === current) return;
  current = token;
  for (const listener of arrivals) listener(token);
}

/* A browser that refuses storage — a private window, blocked site data —
   keeps the token for this page's life only. */
function keep(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch (error) {
    console.warn("Studio could not keep its token for the next visit", error);
  }
}

function kept(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    return token !== null && TOKEN.test(token) ? token : null;
  } catch (error) {
    console.warn("Studio could not read the token kept from an earlier visit", error);
    return null;
  }
}
