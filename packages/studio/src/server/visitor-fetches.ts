import { type Capacity, createCapacity } from "./capacity";
import { StudioBusyError } from "./studio-busy-error";

/** How many specifications Studio fetches at once for callers without the project's token. */
export const VISITOR_FETCHES = 4;

/** The most of those specifications Studio buffers at once, decompressed, together. */
export const VISITOR_FETCH_BYTES = 32 * 1024 * 1024;

/** How long one of them may take, redirects included: a public host answers in seconds. */
export const VISITOR_FETCH_DEADLINE_MS = 15_000;

const fetches = createCapacity(VISITOR_FETCHES);

/** The bytes every fetch for a caller without the token buffers its body in. */
export const visitorFetchBytes: Capacity = createCapacity(VISITOR_FETCH_BYTES);

const BUSY = `Studio fetches up to ${VISITOR_FETCHES} specifications at once for pages without the project's token. Try again in a moment.`;

/**
 * Run a fetch for a caller without the token in one of the
 * {@link VISITOR_FETCHES} places Studio keeps for them, held until the fetch
 * has really ended — its connection closed and its name lookup settled, not
 * merely its caller gone — so callers that hang up cannot have more fetches
 * or lookups under way than that between them. Their names are looked up
 * from public DNS by lookups that stop with the fetch, never by this
 * machine's resolver, whose few threads every lookup of the process waits
 * for: a caller without the token cannot hold up the developer's own.
 *
 * The places are the process's, shared by every Studio in it: they guard
 * its sockets and memory.
 *
 * @param fetch - The fetch, started once a place is free
 * @returns What the fetch returns
 * @throws {StudioBusyError} When every place is taken
 * @example
 * ```ts
 * const text = await asVisitorFetch(() => fetchWithin(url, allowlist, options));
 * ```
 */
export async function asVisitorFetch<TResult>(fetch: () => Promise<TResult>): Promise<TResult> {
  if (!fetches.take()) throw new StudioBusyError(BUSY);
  try {
    return await fetch();
  } finally {
    fetches.give();
  }
}
