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

/* The runtime's undici, read off `globalThis.process`, as code an edge runtime may take reads
   Node's APIs: Next.js refuses to build `process.versions` into a middleware, even after
   `typeof process` is checked. */
const RUNTIME_UNDICI = globalThis.process?.versions?.undici;

/** What this runtime's own `fetch` copies. */
export const FETCH_COPIES: FetchCopies = fetchCopies(RUNTIME_UNDICI);

/* What a fetch is taken to copy where the runtime is built on undici and nothing tells which
   undici that fetch is: one older than the runtime's copies what the runtime's does not. */
const UNKNOWN_UNDICI: FetchCopies = fetchCopies("7.0.0");

/**
 * What the `fetch` that sends a request copies. The runtime's own copies
 * what its undici does. Any other — a source's own — is taken, where the
 * runtime is built on undici, to copy what an undici before 8 does: nothing
 * tells which undici, if any, it is built on, and `undici@7` on Node 26
 * would keep every stream twice. Elsewhere it copies what the runtime's does.
 *
 * @param send - The `fetch` that sends it
 * @returns What it is taken to copy
 * @example
 * ```ts
 * copiesOf(globalThis.fetch).streams; // false under Node 26
 * copiesOf(sourceFetch).streams; // true under any Node
 * ```
 */
export function copiesOf(send: unknown): FetchCopies {
  if (send === globalThis.fetch || RUNTIME_UNDICI === undefined) return FETCH_COPIES;
  return UNKNOWN_UNDICI;
}
