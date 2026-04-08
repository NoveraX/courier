/**
 * Shared payload type for the mock socket event stream.
 *
 * Extracted from `handle-mock-events.ts` so the dispatcher and the per-domain
 * handler files (`handle-mock-server-events.ts`,
 * `handle-mock-request-events.ts`) can share a single import without
 * pulling on the dispatcher itself.
 */

/**
 * Untyped event payload from the socket. Each handler narrows the
 * required fields via `as` casts at the read site — the runtime contract
 * is owned by the studio server side and validated there.
 */
export type MockEvent = Record<string, unknown>;
