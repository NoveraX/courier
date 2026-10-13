import { ConfigurationError } from "../errors/configuration-error";
import { resolveEndpoint } from "../utils/execute-resolve";
import { isRecord } from "../utils/is-record";
import type { SchemaMetadata } from "../validation";
import type { WireShape } from "./boundary-types";

/**
 * Refuse, where an API is defined, a boundary that says otherwise than the
 * API. The browser reads the boundary alone and never the definition, so
 * whatever the two disagree on fails only in the browser: a path the API
 * does not define, a shape the API declares otherwise, or a read whose
 * definition sets `sensitiveVariables` left out of `sensitive` — the
 * browser then sends it as GET, which the proxy refuses with 405 — and one
 * listed there that sends its variables in the address after all.
 *
 * @param api - The API, as `defineApi` built it
 * @param boundary - The boundary it holds
 * @param where - The API, named in the error
 * @throws ConfigurationError `BOUNDARY_MISMATCH`
 * @example
 * ```ts
 * assertBoundaryMatches(api, api.options.boundary, "accounts");
 * ```
 */
export function assertBoundaryMatches(api: object, boundary: unknown, where: string): void {
  if (!isRecord(boundary) || !isRecord(boundary.endpoints)) return;
  const { endpoints } = boundary;
  const sensitive = new Set(Array.isArray(boundary.sensitive) ? boundary.sensitive : []);
  const problems = Object.entries(endpoints).flatMap(([path, exposed]) => {
    const problem = pathProblem(api, path, exposed, sensitive.has(path));
    return problem === undefined ? [] : [problem];
  });
  for (const path of sensitive) {
    if (!Object.hasOwn(endpoints, String(path))) {
      problems.push(`lists "${String(path)}" in sensitive without exposing it`);
    }
  }
  if (problems.length === 0) return;
  throw new ConfigurationError(
    "BOUNDARY_MISMATCH",
    `${where}: the boundary ${problems.join("; and it ")}`,
  );
}

function pathProblem(
  api: object,
  path: string,
  exposed: unknown,
  listed: boolean,
): string | undefined {
  const dot = path.lastIndexOf(".");
  const group = dot < 0 ? undefined : path.slice(0, dot);
  const resolved = resolveEndpoint(api as Record<string, unknown>, group, path.slice(dot + 1));
  const { schema, options } = resolved;
  if (schema === undefined && resolved.endpoint === undefined && !resolved.served) {
    return `exposes "${path}", which the API does not define`;
  }
  const defined = shapeOf(schema);
  const declared = declaredShape(exposed);
  if (declared !== defined) {
    return `exposes "${path}" as a ${declared}, and the API defines it as a ${defined}`;
  }
  const keepsOut = options?.sensitiveVariables === true;
  if (keepsOut && !listed) {
    return `exposes "${path}", whose definition keeps its variables out of the address, without listing it in sensitive: the browser would send it as GET, which the proxy refuses. Add "${path}" to the boundary's sensitive list`;
  }
  if (listed && !keepsOut) {
    return `lists "${path}" in sensitive, and its definition sends its variables in the address: set sensitiveVariables on the endpoint, or take it off the list`;
  }
  return undefined;
}

/* The shape the API gives an endpoint, as a boundary writes one. */
function shapeOf(schema: SchemaMetadata | undefined): WireShape {
  if (schema?.transport === "sse") return "stream";
  if (schema?.transport === "ws") return schema.bidirectional ? "duplex" : "channel";
  return schema?.type === "query" ? "query" : "mutation";
}

/* The shape a boundary gives an endpoint, read back from what it tells the browser. */
function declaredShape(exposed: unknown): WireShape {
  if (!isRecord(exposed)) return "mutation";
  if (exposed.transport === "sse") return "stream";
  if (exposed.transport === "ws") return exposed.bidirectional ? "duplex" : "channel";
  return exposed.type === "query" ? "query" : "mutation";
}
