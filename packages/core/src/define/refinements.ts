import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Middleware } from "../middleware/types";
import type { BuilderState } from "./builder";
import { withHeaders, withMeta, withMiddleware, withSlot, withValue } from "./builder";
import type { RetryOptions } from "./options";

/** A builder as the chain assembles it; `builder-types` gives it its public shape. */
export type AnyBuilder = Record<string, unknown>;

/**
 * The methods that refine an endpoint without saying where it is.
 *
 * Shared by both halves of a chain, so `.response()` reads the same before a
 * verb has been named and after.
 *
 * @param state - The builder so far
 * @param next - Makes the builder that carries an updated state
 * @param where - The endpoint's address for messages, once a verb has named it
 * @returns The slot and option methods
 *
 * @example
 * ```ts
 * const methods = refinements(state, (updated) => makeBuilder(updated));
 * ```
 */
export function refinements(
  state: BuilderState,
  next: (updated: BuilderState) => AnyBuilder,
  where?: string,
): AnyBuilder {
  return {
    response: (schema?: StandardSchemaV1) => next(withSlot(state, "response", schema, where)),
    variables: (schema?: StandardSchemaV1) => next(withSlot(state, "variables", schema, where)),
    send: (schema?: StandardSchemaV1) => next(withSlot(state, "send", schema, where)),
    use: (...middleware: Middleware[]) => next(withMiddleware(state, middleware)),
    headers: (names: readonly string[]) => next(withHeaders(state, names)),
    timeout: (ms: number) => next(withValue(state, "timeout", ms)),
    retry: (options: RetryOptions) => next(withValue(state, "retry", options)),
    meta: (values: Record<string, unknown>) => next(withMeta(state, values)),
  };
}
