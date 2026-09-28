import type { StandardSchemaV1 } from "@standard-schema/spec";

import { ConfigurationError } from "../errors/configuration-error";
import { createLogger } from "../logger";
import { ValidationError } from "../validation";
import { RealtimeValidationError } from "./errors";

const log = createLogger("WS");

/**
 * Hold what a channel sends or broadcasts to its response schema, at the
 * moment it is sent.
 *
 * `ctx.send` and `ctx.broadcast` return nothing and go out in the order they
 * were called, so the value is checked there and then: a schema that answers
 * only asynchronously would hold one message back while the next, or the
 * channel's close, went ahead of it. Such a schema is refused instead.
 *
 * @param schema - The channel's response schema
 * @param value - What the handler sends
 * @returns What goes out — the schema's output, defaults filled in
 * @throws RealtimeValidationError when the value does not match
 * @throws ConfigurationError `ASYNC_RESPONSE_SCHEMA` when the schema validates asynchronously
 *
 * @example
 * ```ts
 * const payload = schema ? checkResponseNow(schema, data) : data;
 * ```
 */
export function checkResponseNow(schema: StandardSchemaV1, value: unknown): unknown {
  const result = schema["~standard"].validate(value);
  if ("then" in result) {
    /* Its outcome no longer matters, but a rejection left unheard would end
       the process as an unhandled one. */
    result.then(undefined, (error: unknown) => log.warn("Async response schema failed", error));
    throw new ConfigurationError(
      "ASYNC_RESPONSE_SCHEMA",
      "[courier] A channel's .response() schema validated asynchronously. ctx.send and " +
        "ctx.broadcast check what they send as they send it, so the schema must validate " +
        "synchronously — move async refinements out of it.",
    );
  }
  if (result.issues) {
    throw new RealtimeValidationError(
      new ValidationError("response", result.issues).message,
      result.issues,
    );
  }
  return result.value;
}
