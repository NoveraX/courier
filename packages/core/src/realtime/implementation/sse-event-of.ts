import { ConfigurationError } from "../../errors/configuration-error";
import type { SSEEvent } from "../types";
import { kindOfValue } from "./kind-of-value";

function isOptional(value: unknown, type: "string" | "number"): boolean {
  return value === undefined || typeof value === type;
}

function isSSEEvent(value: unknown): value is SSEEvent<unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return (
    isOptional("event" in value ? value.event : undefined, "string") &&
    isOptional("id" in value ? value.id : undefined, "string") &&
    isOptional("retry" in value ? value.retry : undefined, "number")
  );
}

/**
 * An event an SSE stream's implementation yielded, checked to be one: an
 * object whose `event` and `id`, when it names them, are text, and whose
 * `retry` is a number.
 *
 * @param value - What the implementation yielded
 * @param endpoint - The endpoint, as an error names it
 * @returns The event
 * @throws {ConfigurationError} `STREAM_IMPLEMENTATION_INVALID` when it is not one
 * @example
 * ```ts
 * for await (const value of eventsOf(endpoint, ctx, "api.feed")) write(sseEventOf(value, "api.feed"));
 * ```
 */
export function sseEventOf(value: unknown, endpoint: string): SSEEvent<unknown> {
  if (isSSEEvent(value)) return value;
  throw new ConfigurationError(
    "STREAM_IMPLEMENTATION_INVALID",
    `[courier] "${endpoint}" yielded ${kindOfValue(value)} that is not an event: an SSE stream yields \`{ data }\`, with \`event\` and \`id\` as text and \`retry\` as a number.`,
  );
}
