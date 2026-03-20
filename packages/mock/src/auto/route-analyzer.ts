import type { StandardSchemaV1 } from "@standard-schema/spec";

const ENDPOINT_SCHEMA = Symbol.for("nexus.endpoint.schema");

/** Analyzed route information from a source endpoint */
export interface RouteInfo {
  /** Group name (e.g. "products") */
  group: string;
  /** Endpoint name (e.g. "getAll") */
  endpoint: string;
  /** HTTP method (e.g. "GET") */
  httpMethod: string;
  /** Relative path within group (e.g. "", ":id") */
  path: string;
  /** Full path including prefix (e.g. "/products/:id") */
  fullPath: string;
  /** Whether path contains an :id parameter */
  hasIdParam: boolean;
  /** Detected CRUD operation */
  operation: CrudOperation;
  /** Response schema if available */
  responseSchema?: StandardSchemaV1;
  /** Variables schema if available */
  variablesSchema?: StandardSchemaV1;
  /** Endpoint type (query/mutation) */
  type?: "query" | "mutation";
}

export type CrudOperation =
  | "list"
  | "get"
  | "create"
  | "update"
  | "replace"
  | "upsert"
  | "delete"
  | "deleteAll"
  | "custom";

/** Source shape expected by analyzeRoutes */
interface SourceGroups {
  [groupName: string]: {
    options?: { prefix?: string };
    [endpointName: string]: unknown;
  };
}

/**
 * Analyze all endpoints in an API source and extract route information.
 * Probes each endpoint function with a mock HTTP client to capture method + path.
 */
export function analyzeRoutes(groups: SourceGroups): RouteInfo[] {
  const routes: RouteInfo[] = [];

  for (const [groupName, group] of Object.entries(groups)) {
    if (groupName === "options") continue;

    const prefix = normalizePrefix(group.options?.prefix ?? `/${groupName}`);

    for (const [endpointName, endpointFn] of Object.entries(group)) {
      if (endpointName === "options" || typeof endpointFn !== "function") continue;

      const probed = probeEndpoint(endpointFn as (...args: unknown[]) => unknown);
      const schema = extractSchema(endpointFn);

      const httpMethod = probed.method?.toUpperCase() ?? "GET";
      const path = probed.path ?? "";
      const fullPath = path ? `${prefix}/${path}`.replace(/\/+/g, "/") : prefix;
      const hasIdParam = path.includes(":id") || path.includes(":");
      const operation = detectOperation(httpMethod, hasIdParam, path);

      routes.push({
        group: groupName,
        endpoint: endpointName,
        httpMethod,
        path,
        fullPath,
        hasIdParam,
        operation,
        responseSchema: schema?.response,
        variablesSchema: schema?.variables,
        type: schema?.type,
      });
    }
  }

  return routes;
}

/** Probe endpoint to capture HTTP method and path */
function probeEndpoint(fn: (...args: unknown[]) => unknown): { method?: string; path?: string } {
  let method: string | undefined;
  let path: string | undefined;

  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      if (typeof prop === "string") {
        method = prop;
      }
      return (...args: unknown[]) => {
        if (typeof args[0] === "string") path = args[0];
        return Promise.resolve({});
      };
    },
  };

  const mockHttp = new Proxy({}, handler);

  try {
    fn(mockHttp, {});
  } catch {
    // Endpoint may throw during probing — path/method already captured
  }

  return { method, path: path || undefined };
}

/** Detect CRUD operation from HTTP method + path pattern */
function detectOperation(httpMethod: string, hasIdParam: boolean, path: string): CrudOperation {
  switch (httpMethod) {
    case "GET":
      return hasIdParam ? "get" : "list";
    case "POST":
      return "create";
    case "PUT":
      return hasIdParam ? "replace" : "upsert";
    case "PATCH":
      return hasIdParam ? "update" : "custom";
    case "DELETE":
      return hasIdParam || path ? "delete" : "deleteAll";
    default:
      return "custom";
  }
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

interface SchemaMetadata {
  response?: StandardSchemaV1;
  variables?: StandardSchemaV1;
  type?: "query" | "mutation";
}

function extractSchema(fn: unknown): SchemaMetadata | undefined {
  if (typeof fn !== "function") return undefined;
  return (fn as unknown as Record<symbol, SchemaMetadata | undefined>)[ENDPOINT_SCHEMA];
}
