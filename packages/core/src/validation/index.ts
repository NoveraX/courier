import type { StandardSchemaV1 } from "@standard-schema/spec";
import { CourierError } from "../errors/courier-error";

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
