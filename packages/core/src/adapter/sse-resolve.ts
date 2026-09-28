import type { Sources } from "../define/types";
import { resolveEndpoint } from "../utils/execute-resolve";
import { parseWireVariables, WIRE_VARIABLES_KEY } from "../utils/wire-variables";
import type { SchemaMetadata } from "../validation";
import { ValidationError, validateSchema } from "../validation";
import { isExposedToWire } from "./exposure";
import { errorResponse } from "./parse";

/**
 * The stream a proxy request names: one this process serves with
 * `.implement()`, or one another server serves, which the proxy relays.
 */
export interface ResolvedStream {
  /** The source it belongs to */
  api: Sources[string];
  endpoint: unknown;
  schema: SchemaMetadata | undefined;
  /** Served elsewhere: opened where its definition says, and relayed */
  relayed: boolean;
}

/** Resolve SSE endpoint from sources, validate transport type */
export function resolveSSEEndpoint(
  sources: Sources,
  source: string,
  group: string | undefined,
  method: string,
): ResolvedStream | Response {
  const notFound = `[${source}][${group ?? ""}][${method}]: method not found`;

  const dataSource = Object.hasOwn(sources, source) ? sources[source] : undefined;
  /* Every SSE resolution comes off the wire, so an unknown source is answered
     as an unknown method is — see the same rule in `executeRequest`. */
  if (!dataSource) return errorResponse(400, notFound);

  const { endpoint, schema, served } = resolveEndpoint(dataSource, group, method);

  if (typeof endpoint !== "function") {
    return errorResponse(400, notFound);
  }

  /* Same answer as an unknown name, for the same reason. */
  if (!isExposedToWire(dataSource, group, method)) {
    return errorResponse(400, notFound);
  }
  if (schema?.transport !== "sse") {
    return errorResponse(400, `[${method}]: endpoint is not an SSE transport`);
  }
  return { api: dataSource, endpoint, schema, relayed: !served };
}

/** Decode the SSE variables from the `_v` parameter and check them against the endpoint schema */
export async function resolveSSEVariables(
  params: URLSearchParams,
  schema: SchemaMetadata | undefined,
): Promise<Record<string, unknown> | undefined | Response> {
  const decoded = parseWireVariables(params.get(WIRE_VARIABLES_KEY));
  if (!decoded.ok) return errorResponse(400, decoded.reason);
  const raw = decoded.variables;
  if (!schema?.variables) return raw;

  try {
    return (await validateSchema(schema.variables, raw ?? {}, "variables")) as Record<
      string,
      unknown
    >;
  } catch (error) {
    /* Answered as an HTTP call's invalid variables are, issues included;
       anything else a schema throws is not the caller's fault. */
    if (!(error instanceof ValidationError)) throw error;
    return Response.json(
      { success: false, message: error.message, target: error.target, issues: error.issues },
      { status: 422 },
    );
  }
}
