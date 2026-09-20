import type { Sources } from "../define/types";
import { composeMiddleware } from "../middleware";
import { buildMiddlewareContext, resolveEndpoint } from "../utils/execute-resolve";
import type { SchemaMetadata } from "../validation";
import { validateSchema } from "../validation";
import { LIMITS } from "./limits";
import { errorResponse } from "./parse";
import { extractVariables } from "./sse-utils";

/** Resolve SSE endpoint from sources, validate transport type */
export function resolveSSEEndpoint(
  sources: Sources,
  source: string,
  group: string | undefined,
  method: string,
): { endpoint: unknown; schema: SchemaMetadata | undefined } | Response {
  const dataSource = Object.hasOwn(sources, source) ? sources[source] : undefined;
  if (!dataSource) return errorResponse(400, `[${source}]: source not found`);

  const { endpoint, schema, served } = resolveEndpoint(dataSource, group, method);
  if (typeof endpoint !== "function") {
    return errorResponse(400, `[${source}][${group ?? ""}][${method}]: method not found`);
  }
  if (schema?.transport !== "sse") {
    return errorResponse(400, `[${method}]: endpoint is not an SSE transport`);
  }
  if (!served) {
    return errorResponse(
      400,
      `[${method}]: endpoint describes where to connect rather than serving the stream — ` +
        "define it with .implement() to serve it from this process",
    );
  }
  return { endpoint, schema };
}

/** Extract and validate SSE variables from query params against endpoint schema */
export async function resolveSSEVariables(
  params: URLSearchParams,
  schema: SchemaMetadata | undefined,
): Promise<Record<string, unknown> | undefined | Response> {
  const raw = extractVariables(params);
  if (!schema?.variables) return raw;

  try {
    return (await validateSchema(schema.variables, raw ?? {}, "variables")) as Record<
      string,
      unknown
    >;
  } catch {
    return errorResponse(400, "Invalid SSE variables");
  }
}

/** Run middleware chain with timeout for SSE requests */
export async function runSSEMiddleware(
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
    "sse",
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
        setTimeout(() => reject(new Error("SSE middleware timeout")), LIMITS.MIDDLEWARE_TIMEOUT_MS),
      ),
    ]);
  }

  return middlewareCtx.headers;
}
