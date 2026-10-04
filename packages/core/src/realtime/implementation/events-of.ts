import { ConfigurationError } from "../../errors/configuration-error";
import { kindOfValue } from "./kind-of-value";

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === "function"
  );
}

/**
 * Run a stream's implementation — an SSE or a WS push handler — and check
 * that it returned something to read with `for await`, as an async generator
 * function does.
 *
 * @param implementation - What the endpoint was given with `.implement()`
 * @param ctx - The context to run it with
 * @param endpoint - The endpoint, as an error names it
 * @returns What it returned
 * @throws {ConfigurationError} `STREAM_IMPLEMENTATION_INVALID` when it is not a function, or returned something else
 * @example
 * ```ts
 * for await (const value of eventsOf(endpoint, wsCtx, "api.chat.feed")) send(value);
 * ```
 */
export function eventsOf(
  implementation: unknown,
  ctx: unknown,
  endpoint: string,
): AsyncIterable<unknown> {
  if (typeof implementation !== "function") {
    throw new ConfigurationError(
      "STREAM_IMPLEMENTATION_INVALID",
      `[courier] The implementation of "${endpoint}" is ${kindOfValue(implementation)}, not a function.`,
    );
  }
  const events: unknown = Reflect.apply(implementation, undefined, [ctx]);
  if (isAsyncIterable(events)) return events;
  throw new ConfigurationError(
    "STREAM_IMPLEMENTATION_INVALID",
    `[courier] The implementation of "${endpoint}" returned ${kindOfValue(events)}, where a stream's returns what it yields: write it as \`async function* (ctx) { yield ... }\`.`,
  );
}
