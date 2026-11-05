/** What a platform's `fetch` keeps a copy of, whole, for as long as it sends a request's body. */
export interface FetchCopies {
  /** A body it can read again, a FormData or a Blob, whatever the request */
  readonly forms: boolean;
  /** A stream, unless the request tells it to follow no redirect */
  readonly streams: boolean;
}

/**
 * What the `fetch` of a runtime built on undici, at `version`, copies.
 *
 * Undici, Node's `fetch`, takes the Fetch standard's step of cloning each
 * request it may have to send again — after a redirect — and a clone tees
 * the body's stream: one branch is sent, the other kept until the request
 * ends, a second copy of the whole body. Every version clones a body it can
 * read again. Undici 8, Node 26's, leaves the clone out for a stream, as the
 * standard allows; before it, a stream is cloned too, unless the request's
 * `redirect` is `"error"`, the one mode that never sends a body again.
 * Every other runtime's `fetch` reads a body as it sends it.
 *
 * @param version - The runtime's undici, `process.versions.undici`, or `undefined` for none
 * @returns What its `fetch` copies
 *
 * @example
 * ```ts
 * fetchCopies("7.30.1"); // → { forms: true, streams: true }
 * fetchCopies("8.12.2"); // → { forms: true, streams: false }
 * fetchCopies(undefined); // → { forms: false, streams: false }
 * ```
 */
export function fetchCopies(version: string | undefined): FetchCopies {
  if (version === undefined) return { forms: false, streams: false };
  const major = Number(/^(\d+)\./.exec(version)?.[1]);
  return { forms: true, streams: !(major >= 8) };
}

/** What this runtime's own `fetch` copies. */
export const FETCH_COPIES: FetchCopies = fetchCopies(
  typeof process === "undefined" ? undefined : process.versions?.undici,
);
