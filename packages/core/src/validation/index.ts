import type { StandardSchemaV1 } from "@standard-schema/spec";
import { CourierError } from "../errors";

/** Symbol key for attaching schema metadata to endpoint functions */
export const ENDPOINT_SCHEMA: unique symbol = Symbol.for("courier.endpoint.schema");

/** Cache configuration for proxy GET responses */
export interface CacheConfig {
  /** Cache duration in seconds (maps to s-maxage) */
  revalidate?: number | undefined;
  /** Tags for Next.js revalidateTag() invalidation */
  tags?: string[] | undefined;
}

/** Transport mode for an endpoint */
export type Transport = "http" | "sse" | "ws";

/** Schema metadata attached to an endpoint function */
export interface SchemaMetadata {
  response?: StandardSchemaV1;
  variables?: StandardSchemaV1;
  /** Endpoint type — "query" enables GET proxy, "mutation" requires POST */
  type?: "query" | "mutation";
  /** Cache hints for proxy GET responses */
  cache?: CacheConfig;
  /** Transport mode — "http" (default), "sse" for streaming, "ws" for WebSocket */
  transport?: Transport;
  /** Standard Schema for incoming WS messages (bidirectional channels only) */
  receive?: StandardSchemaV1;
  /**
   * May the caller send on this channel?
   *
   * Set by declaring the send slot, with or without a schema — a channel whose
   * inbound messages are typed but not validated is still bidirectional.
   */
  bidirectional?: true;
}

/** A single validation issue from Standard Schema */
export interface ValidationIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

/** Error thrown when schema validation fails */
export class ValidationError extends CourierError<"VALIDATION_ERROR"> {
  readonly issues: readonly ValidationIssue[];
  readonly target: "response" | "variables" | "receive";

  constructor(target: "response" | "variables" | "receive", issues: readonly ValidationIssue[]) {
    const messages = issues.map((i) => i.message).join("; ");
    super(`Validation failed (${target}): ${messages}`, {
      code: "VALIDATION_ERROR",
      context: { target, issueCount: issues.length },
    });
    this.name = "ValidationError";
    this.issues = issues;
    this.target = target;
  }
}

/** Type guard for ValidationError */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/** Validate a value against a Standard Schema, throws ValidationError on failure */
export async function validateSchema<TOutput>(
  schema: StandardSchemaV1<unknown, TOutput>,
  value: unknown,
  target: "response" | "variables" | "receive",
): Promise<TOutput> {
  const result = await schema["~standard"].validate(value);

  if (result.issues) {
    throw new ValidationError(target, result.issues);
  }

  return (result as StandardSchemaV1.SuccessResult<TOutput>).value;
}

/** Infer the output type from a Standard Schema */
export type InferOutput<TSchema extends StandardSchemaV1> = NonNullable<
  TSchema["~standard"]["types"]
>["output"];
