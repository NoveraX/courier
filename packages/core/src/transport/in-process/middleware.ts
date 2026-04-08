import { LIMITS } from "../../adapter/limits";
import type { Sources } from "../../define/types";
import { composeMiddleware } from "../../middleware";
import { buildMiddlewareContext } from "../../utils/execute-resolve";

/**
 * Run a source's middleware chain for an in-process stream call.
 *
 * Mirrors `runSSEMiddleware` / `runMiddleware` but is transport-parameterized
 * and decoupled from any per-connection context (SSE response, WS socket).
 * Returns the merged Headers ready to be passed to the endpoint context.
 *
 * Throws if the chain rejects or exceeds the canonical middleware timeout —
 * the caller (executor) is responsible for surfacing the error.
 */
export async function runInProcessMiddleware(
  transport: "sse" | "ws",
  sources: Sources,
  source: string,
  group: string | undefined,
  method: string,
  variables: Record<string, unknown> | undefined,
  request: Request,
  requestId: string,
): Promise<Headers> {
  const dataSource = sources[source] as Record<string, unknown>;
  const middlewareCtx = buildMiddlewareContext(
    source,
    group,
    method,
    variables,
    undefined,
    { req: request, mode: "proxy" as const },
    dataSource,
    requestId,
    transport,
  );

  const opts = dataSource.options as Record<string, unknown> | undefined;
  const middlewares = opts?.middleware as Parameters<typeof composeMiddleware>[0] | undefined;

  if (middlewares?.length) {
    await Promise.race([
      composeMiddleware(middlewares)(middlewareCtx, async () => ({
        status: 200,
        data: undefined,
        headers: new Headers(),
      })),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`In-process ${transport} middleware timeout`)),
          LIMITS.MIDDLEWARE_TIMEOUT_MS,
        ),
      ),
    ]);
  }

  return middlewareCtx.headers;
}
