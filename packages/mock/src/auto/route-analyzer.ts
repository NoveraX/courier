import { normalizeHttpMethod } from "@noverax/nexus";
import type { StandardSchemaV1 } from "@standard-schema/spec";

const ENDPOINT_SCHEMA = Symbol.for("nexus.endpoint.schema");

/** Analyzed route information from a source endpoint */
export interface RouteInfo {
  /** Group/collection name (e.g. "products", or derived from path for top-level endpoints) */
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

/** Shape of a group within source.options.groups */
interface SourceGroup {
  options?: { prefix?: string };
  [endpointName: string]: unknown;
}

/**
 * Analyze all endpoints in an API source and extract route information.
 * Handles both grouped endpoints (source.options.groups) and top-level endpoints.
 *
 * @param source - The full source object from defineApi()
 */
export function analyzeRoutes(source: Record<string, unknown>): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const opts = source.options as { groups?: Record<string, SourceGroup> } | undefined;
  const groups = opts?.groups;

  // Grouped endpoints
  if (groups) {
    for (const [groupName, group] of Object.entries(groups)) {
      if (groupName === "options") continue;
      analyzeGroup(routes, groupName, group);
    }
  }

  // Top-level endpoints (functions at source root, not inside groups)
  for (const [name, fn] of Object.entries(source)) {
    if (name === "options" || typeof fn !== "function") continue;
    const probed = probeEndpoint(fn as (...args: unknown[]) => unknown);
    const rawPath = probed.path ?? name;
    const collection = rawPath.split("/")[0]?.replace(/^:/, "") || name;
    // Normalize path relative to the derived group prefix so detectOperation
    // treats the collection root ("users") as "" (list), not a static sub-path.
    const normalizedPath =
      rawPath === collection
        ? ""
        : rawPath.startsWith(`${collection}/`)
          ? rawPath.slice(collection.length + 1)
          : rawPath;
    analyzeEndpoint(
      routes,
      collection,
      name,
      fn as (...args: unknown[]) => unknown,
      `/${collection}`,
      { ...probed, path: normalizedPath },
    );
  }

  return routes;
}

/**
 * Get the set of declared group names from a source.
 * Useful for distinguishing grouped vs top-level endpoints in UI display.
 */
export function getSourceGroupNames(source: Record<string, unknown>): Set<string> {
  const opts = source.options as { groups?: Record<string, unknown> } | undefined;
  if (!opts?.groups) return new Set();
  return new Set(Object.keys(opts.groups).filter((k) => k !== "options"));
}

function analyzeGroup(routes: RouteInfo[], groupName: string, group: SourceGroup): void {
  const prefix = normalizePrefix(group.options?.prefix ?? `/${groupName}`);
  for (const [endpointName, endpointFn] of Object.entries(group)) {
    if (endpointName === "options" || typeof endpointFn !== "function") continue;
    analyzeEndpoint(
      routes,
      groupName,
      endpointName,
      endpointFn as (...args: unknown[]) => unknown,
      prefix,
    );
  }
}

function analyzeEndpoint(
  routes: RouteInfo[],
  groupName: string,
  endpointName: string,
  endpointFn: (...args: unknown[]) => unknown,
  prefix: string,
  preProbed?: { method?: string; path?: string },
): void {
  const probed = preProbed ?? probeEndpoint(endpointFn);
  const schema = extractSchema(endpointFn);

  const httpMethod = normalizeHttpMethod(probed.method ?? "GET");
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
  const isStaticSubPath = !!path && !path.startsWith(":");

  switch (httpMethod) {
    case "GET":
      if (hasIdParam) return "get";
      // Static sub-paths (e.g. "browse", "categories") are custom endpoints, not list
      if (isStaticSubPath) return "custom";
      return "list";
    case "POST":
      return isStaticSubPath ? "custom" : "create";
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
