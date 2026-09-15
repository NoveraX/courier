import { normalizeHttpMethod } from "@noverax/courier";
import { extractSchema, isEndpoint, normalizePrefix, probeEndpoint } from "./endpoint-probe";
import { detectOperation } from "./operation-detect";
import type { RouteInfo, SourceGroup } from "./route-types";

// Re-export types so external imports keep working unchanged.
export type { CrudOperation, RouteInfo } from "./route-types";

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
    if (name === "options" || !isEndpoint(fn)) continue;
    analyzeTopLevelEndpoint(routes, name, fn as (...args: unknown[]) => unknown);
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

function analyzeTopLevelEndpoint(
  routes: RouteInfo[],
  name: string,
  fn: (...args: unknown[]) => unknown,
): void {
  const probed = probeEndpoint(fn);
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
  analyzeEndpoint(routes, collection, name, fn, `/${collection}`, {
    ...probed,
    path: normalizedPath,
  });
}

function analyzeGroup(routes: RouteInfo[], groupName: string, group: SourceGroup): void {
  const prefix = normalizePrefix(group.options?.prefix ?? `/${groupName}`);
  for (const [endpointName, endpointFn] of Object.entries(group)) {
    if (endpointName === "options" || !isEndpoint(endpointFn)) continue;
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
  const schema = extractSchema(endpointFn);
  const transport = schema?.transport;

  // SSE/WS endpoints don't accept an http argument — skip probing to avoid
  // calling the generator/channel factory with garbage. They live at a
  // path equal to the endpoint name (e.g. "feed" → /notifications/feed).
  if (transport === "sse" || transport === "ws") {
    const fullPath = `${prefix}/${endpointName}`.replace(/\/+/g, "/");
    routes.push({
      group: groupName,
      endpoint: endpointName,
      httpMethod: "GET",
      path: endpointName,
      fullPath,
      hasIdParam: false,
      operation: "custom",
      responseSchema: schema?.response,
      variablesSchema: schema?.variables,
      type: schema?.type,
      transport,
      isChannel: transport === "ws" && !!schema?.receive,
    });
    return;
  }

  const probed = preProbed ?? probeEndpoint(endpointFn);
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
    transport: "http",
  });
}
