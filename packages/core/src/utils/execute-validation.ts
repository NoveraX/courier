import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { DevToolsHooks } from "../devtools";
import { ValidationError, validateSchema } from "../validation";

export type ValidationTimingCtx = {
  hasDevtools: boolean;
  requestId: string;
  dt: Partial<DevToolsHooks>;
};

export async function validateVariables(
  schema: StandardSchemaV1,
  variables: unknown,
  ctx: ValidationTimingCtx,
): Promise<{ validated: unknown; duration: number }> {
  const vt0 = ctx.hasDevtools ? performance.now() : 0;
  ctx.dt.onValidationStart?.({
    requestId: ctx.requestId,
    target: "variables",
    timestamp: Date.now(),
  });

  try {
    const validated = await validateSchema(schema, variables, "variables");
    const duration = ctx.hasDevtools ? performance.now() - vt0 : 0;
    ctx.dt.onValidationPass?.({
      requestId: ctx.requestId,
      target: "variables",
      duration,
      timestamp: Date.now(),
    });
    return { validated, duration };
  } catch (error) {
    const duration = ctx.hasDevtools ? performance.now() - vt0 : 0;
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
  const rvt0 = ctx.hasDevtools ? performance.now() : 0;
  ctx.dt.onValidationStart?.({
    requestId: ctx.requestId,
    target: "response",
    timestamp: Date.now(),
  });

  try {
    const validated = await validateSchema(schema, data, "response");
    const duration = ctx.hasDevtools ? performance.now() - rvt0 : 0;
    ctx.dt.onValidationPass?.({
      requestId: ctx.requestId,
      target: "response",
      duration,
      timestamp: Date.now(),
    });
    return { validated, duration };
  } catch (error) {
    const duration = ctx.hasDevtools ? performance.now() - rvt0 : 0;
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
