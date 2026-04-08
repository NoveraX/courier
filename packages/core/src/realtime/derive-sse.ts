import type { SSEContext, SSEEvent, SSEHandler } from "./types";

/**
 * Compose a derived SSE stream by transforming events from a source handler.
 * The transform receives an async iterable of source events and yields
 * derived events — enabling filtering, batching, enrichment, and composition.
 *
 * Both source and derived streams share the same AbortSignal: disconnecting
 * the derived stream automatically cancels the source generator.
 *
 * @param source - Source SSE handler (async generator factory)
 * @param transform - Async generator that reads source events and yields derived events
 * @returns New SSE handler with the same lifecycle semantics
 *
 * @example
 * // Filter: only high-priority notifications
 * const priority = deriveSSE(allNotifications, async function* (events) {
 *   for await (const event of events) {
 *     if (event.data.priority === "high") yield event;
 *   }
 * });
 *
 * @example
 * // Batch: collect events into groups of 10
 * const batched = deriveSSE(rapidEvents, async function* (events) {
 *   let buffer: unknown[] = [];
 *   for await (const event of events) {
 *     buffer.push(event.data);
 *     if (buffer.length >= 10) {
 *       yield { data: buffer };
 *       buffer = [];
 *     }
 *   }
 *   if (buffer.length > 0) yield { data: buffer };
 * });
 */
export function deriveSSE<TSource, TDerived, TVariables = undefined>(
  source: SSEHandler<TSource, TVariables>,
  transform: (
    events: AsyncIterable<SSEEvent<TSource>>,
    ctx: SSEContext<TVariables>,
  ) => AsyncGenerator<SSEEvent<TDerived>, void, unknown>,
): SSEHandler<TDerived, TVariables> {
  return async function* (ctx: SSEContext<TVariables>) {
    const sourceGen = source(ctx);
    try {
      yield* transform(sourceGen, ctx);
    } finally {
      // Ensure source generator is cleaned up if derived ends early
      await sourceGen.return(undefined);
    }
  };
}
