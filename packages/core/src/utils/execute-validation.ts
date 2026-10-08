import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { StudioHooks } from "../studio";
import { ValidationError, validateSchema } from "../validation";

export type ValidationTimingCtx = {
  hasStudio: boolean;
  requestId: string;
  dt: Partial<StudioHooks>;
};

export async function validateVariables(
  schema: StandardSchemaV1,
  variables: unknown,
  ctx: ValidationTimingCtx,
): Promise<{ validated: unknown; duration: number }> {
  const vt0 = ctx.hasStudio ? performance.now() : 0;
  ctx.dt.onValidationStart?.({
    requestId: ctx.requestId,
    target: "variables",
    timestamp: Date.now(),
  });

  try {
    const validated = await validateSchema(schema, await absentAs(schema, variables), "variables");
    const duration = ctx.hasStudio ? performance.now() - vt0 : 0;
    ctx.dt.onValidationPass?.({
      requestId: ctx.requestId,
      target: "variables",
      duration,
      timestamp: Date.now(),
    });
    return { validated, duration };
  } catch (error) {
    const duration = ctx.hasStudio ? performance.now() - vt0 : 0;
    if (error instanceof ValidationError) {
      ctx.dt.onValidationFail?.({
        requestId: ctx.requestId,
        target: "variables",
        issues: error.issues,
        duration,
        timestamp: Date.now(),
      });
    }
    throw error;
  }
}

export async function validateResponse(
  schema: StandardSchemaV1,
  data: unknown,
  ctx: ValidationTimingCtx,
): Promise<{ validated: unknown; duration: number }> {
  const rvt0 = ctx.hasStudio ? performance.now() : 0;
  ctx.dt.onValidationStart?.({
    requestId: ctx.requestId,
    target: "response",
    timestamp: Date.now(),
  });

  try {
    const validated = await validateSchema(schema, data, "response");
    const duration = ctx.hasStudio ? performance.now() - rvt0 : 0;
    ctx.dt.onValidationPass?.({
      requestId: ctx.requestId,
      target: "response",
      duration,
      timestamp: Date.now(),
    });
    return { validated, duration };
  } catch (error) {
    const duration = ctx.hasStudio ? performance.now() - rvt0 : 0;
    if (error instanceof ValidationError) {
      ctx.dt.onValidationFail?.({
        requestId: ctx.requestId,
        target: "response",
        issues: error.issues,
        duration,
        timestamp: Date.now(),
      });
    }
    throw error;
  }
}

/**
 * The variables a call's schema is handed: those given, or for a call made
 * with none, what "no variables" means to that schema. A schema whose fields
 * are all optional makes the argument optional in the call signature, so
 * "no variables" has to mean an empty object — handed `undefined`, every
 * such schema rejected the call it invited. A schema that takes `undefined`
 * itself, a body the operation does not require, is handed that: an empty
 * object is not a list or a scalar.
 *
 * @param schema - The endpoint's variables schema
 * @param variables - The variables the call was made with
 * @returns What the schema validates
 * @example
 * ```ts
 * await absentAs(z.object({ page: z.number().optional() }), undefined); // → {}
 * ```
 */
export async function absentAs(schema: StandardSchemaV1, variables: unknown): Promise<unknown> {
  if (variables !== undefined && variables !== null) return variables;
  const none = await schema["~standard"].validate(undefined);
  return none.issues ? {} : undefined;
}
