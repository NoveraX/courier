import { ConfigurationError } from "../../errors/configuration-error";
import type { ChannelHandlers } from "../types";
import { kindOfValue } from "./kind-of-value";

function isOptionalFunction(value: unknown): boolean {
  return value === undefined || typeof value === "function";
}

function isChannelHandlers(value: unknown): value is ChannelHandlers {
  if (typeof value !== "object" || value === null) return false;
  return (
    "onMessage" in value &&
    typeof value.onMessage === "function" &&
    isOptionalFunction("onJoin" in value ? value.onJoin : undefined) &&
    isOptionalFunction("onLeave" in value ? value.onLeave : undefined)
  );
}

/**
 * Run a channel's implementation for the handlers of one connection, and
 * check that it returned them: `onMessage`, and `onJoin` and `onLeave` when
 * it has them, each a function.
 *
 * @param implementation - What the channel was given with `.implement()`
 * @param variables - The connection's variables, validated
 * @param endpoint - The channel, as an error names it
 * @returns The connection's handlers
 * @throws {ConfigurationError} `STREAM_IMPLEMENTATION_INVALID` when it is not a function, or returned something else
 * @example
 * ```ts
 * const handlers = channelHandlersOf(endpoint, variables, "api.chat.room");
 * await handlers.onJoin?.(ctx);
 * ```
 */
export function channelHandlersOf(
  implementation: unknown,
  variables: unknown,
  endpoint: string,
): ChannelHandlers {
  if (typeof implementation !== "function") {
    throw new ConfigurationError(
      "STREAM_IMPLEMENTATION_INVALID",
      `[courier] The implementation of "${endpoint}" is ${kindOfValue(implementation)}, not a function.`,
    );
  }
  const handlers: unknown = Reflect.apply(implementation, undefined, [variables]);
  if (isChannelHandlers(handlers)) return handlers;
  throw new ConfigurationError(
    "STREAM_IMPLEMENTATION_INVALID",
    `[courier] The implementation of "${endpoint}" returned ${kindOfValue(handlers)}, where a channel's returns its handlers: \`() => ({ onMessage(ctx, message) { ... } })\`.`,
  );
}
