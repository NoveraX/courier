import { composeMiddleware } from "../middleware";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { buildMiddlewareContext } from "../utils/execute-resolve";
import { validateSchema } from "../validation";
import type { WSSocketContext } from "./ws-context";

export const VALIDATION_FAILED = Symbol("validation_failed");

/** Validate subscribe variables against schema, sending error on failure */
export async function validateVariablesSafe(
  ctx: WSSocketContext,
  msg: WSMessage,
  schema: { variables?: { "~standard": { validate: (v: unknown) => unknown } } },
): Promise<unknown> {
  if (!schema.variables) return msg.payload;
  try {
    return await validateSchema(
      schema.variables as Parameters<typeof validateSchema>[0],
      msg.payload,
      "variables",
    );
  } catch {
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 4422, message: "Invalid variables" },
    });
    return VALIDATION_FAILED;
  }
}

/** Run source middleware with timeout protection */
export async function runMiddleware(
  ctx: WSSocketContext,
  source: string,
  group: string | undefined,
  method: string,
  variables: unknown,
): Promise<void> {
  const dataSource = ctx.sources[source] as Record<string, unknown>;
  const middlewareCtx = buildMiddlewareContext(
    source,
    group,
    method,
    variables,
    undefined,
    { req: ctx.request, mode: "proxy" as const },
    dataSource,
    ctx.requestId,
    "ws",
  );
  const opts = dataSource.options as Record<string, unknown> | undefined;
  const middlewares = opts?.middleware as Parameters<typeof composeMiddleware>[0] | undefined;
  if (middlewares?.length) {
    await withTimeout(
      composeMiddleware(middlewares)(middlewareCtx, async () => ({
        status: 200,
        data: undefined,
        headers: new Headers(),
      })),
      ctx.middlewareTimeoutMs,
    );
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Middleware timeout (${ms}ms)`)), ms);
    }),
  ]);
}
