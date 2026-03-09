import type { StandardSchemaV1 } from "@standard-schema/spec";

/** Symbol key for attaching schema metadata to endpoint functions */
export const ENDPOINT_SCHEMA: unique symbol = Symbol.for("nexus.endpoint.schema");

/** Schema metadata attached to an endpoint function */
export interface SchemaMetadata {
  response?: StandardSchemaV1;
  variables?: StandardSchemaV1;
}

/** A single validation issue from Standard Schema */
export interface ValidationIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

/** Error thrown when schema validation fails */
export class ValidationError extends Error {
  readonly issues: readonly ValidationIssue[];
  readonly target: "response" | "variables";

  constructor(target: "response" | "variables", issues: readonly ValidationIssue[]) {
    const messages = issues.map((i) => i.message).join("; ");
    super(`Validation failed (${target}): ${messages}`);
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
export async function validateSchema<T>(
  schema: StandardSchemaV1<unknown, T>,
  value: unknown,
  target: "response" | "variables",
): Promise<T> {
  const result = await schema["~standard"].validate(value);

  if (result.issues) {
    throw new ValidationError(target, result.issues);
  }

  return (result as StandardSchemaV1.SuccessResult<T>).value;
}

/** Infer the output type from a Standard Schema */
export type InferOutput<T extends StandardSchemaV1> = NonNullable<
  T["~standard"]["types"]
>["output"];
