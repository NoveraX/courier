import type { Sources } from "../define/types";
import { resolveEndpoint } from "../utils/execute-resolve";
import type { SchemaMetadata } from "../validation";
import { validateSchema } from "../validation";
import { isExposedToWire } from "./exposure";
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
  const notFound = `[${source}][${group ?? ""}][${method}]: method not found`;

  if (typeof endpoint !== "function") {
    return errorResponse(400, notFound);
  }

  /* Same answer as an unknown name, for the same reason. */
  if (!isExposedToWire(dataSource, group)) {
    return errorResponse(400, notFound);
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
