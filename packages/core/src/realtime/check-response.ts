import type { StandardSchemaV1 } from "@standard-schema/spec";

import { ValidationError, validateSchema } from "../validation";
import { RealtimeValidationError } from "./errors";

/**
 * Hold a value a served stream or push channel sends to the endpoint's
 * response schema, as an HTTP call's response is held to its own.
 *
 * The value that goes out is the schema's output — defaults filled in,
 * transforms applied — so the client reads what the schema promises, not
 * whatever a generator sent; one that does not match fails the stream with
 * the schema's issues, as an HTTP response that does not match is answered
 * with a 422.
 *
 * @param schema - The endpoint's response schema
 * @param value - What the generator produced
 * @returns What to send
 * @throws RealtimeValidationError when the value does not match
 * @example
 * ```ts
 * const data = schema ? await checkResponse(schema, event.data) : event.data;
 * ```
 */
export async function checkResponse(schema: StandardSchemaV1, value: unknown): Promise<unknown> {
  try {
    return await validateSchema(schema, value, "response");
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    throw new RealtimeValidationError(error.message, error.issues);
  }
}
