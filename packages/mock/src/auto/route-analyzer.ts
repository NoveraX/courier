import {
  eachGroup,
  groupOptionsOf,
  normalizeHttpMethod,
  type PlacedGroup,
  pathParamNames,
} from "@noverax/courier/internal";
import { recordParam } from "../server/path-shape";
import { channelShape } from "./channel-shape";
import {
  extractSchema,
  isEndpoint,
  normalizePrefix,
  probeEndpoint,
  realtimePath,
} from "./endpoint-probe";
import { detectOperation } from "./operation-detect";
import type { RouteInfo } from "./route-types";
import { splitQuery } from "./split-query";

/**
 * Analyze all endpoints in an API source and extract route information.
 * Handles grouped endpoints — groups inside groups too, each named by its
 * path, `billing.invoices` — and top-level endpoints.
 *
 * @param source - The full source object from defineApi()
 */
export function analyzeRoutes(source: Record<string, unknown>): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const placed of eachGroup(source)) analyzeGroup(routes, placed);

  // Top-level endpoints (functions at source root, not inside groups)
  for (const [name, fn] of Object.entries(source)) {
    if (name === "options" || !isEndpoint(fn)) continue;
    analyzeTopLevelEndpoint(routes, name, fn);
  }

  return routes;
}

/**
 * Get the set of declared group paths from a source, every group inside
 * another included: `billing`, `billing.invoices`.
 * Useful for distinguishing grouped vs top-level endpoints in UI display.
 */
export function getSourceGroupNames(source: Record<string, unknown>): Set<string> {
  return new Set([...eachGroup(source)].map((placed) => placed.path));
}

const LEADING_SLASHES = /^\/+/;

/* A declared path split at its first segment, the collection it names. */
function rooted(declared: string, name: string): { collection: string; path: string } {
  // "/orders" and "orders" name the same path; its first segment is the collection
  const rawPath = declared.replace(LEADING_SLASHES, "");
  const collection = rawPath.split("/")[0]?.replace(/^:/, "") || name;
  // Normalize path relative to the derived group prefix so detectOperation
  // treats the collection root ("users") as "" (list), not a static sub-path.
  const path =
    rawPath === collection
      ? ""
      : rawPath.startsWith(`${collection}/`)
        ? rawPath.slice(collection.length + 1)
        : rawPath;
  return { collection, path };
}

function analyzeTopLevelEndpoint(routes: RouteInfo[], name: string, fn: unknown): void {
  const probed = probeEndpoint(fn);
  const declared = splitQuery(probed.path ?? name);
  const { collection, path } = rooted(declared.path, name);
  const at = declared.query ? `${path}?${declared.query}` : path;
  analyzeEndpoint(routes, collection, name, fn, `/${collection}`, { ...probed, path: at });
}

/**
 * A group's endpoints at its prefix, joined after every group's above it.
 * A group that declares no prefix is called at the paths its endpoints
 * declare alone, so each is served there: its operation read from the
 * collection its path starts with, and no catch-all claims the prefix.
 */
function analyzeGroup(routes: RouteInfo[], placed: PlacedGroup): void {
  const base = normalizePrefix(groupOptionsOf(placed.chain).prefix ?? "");
  const exact = typeof placed.group.options?.prefix !== "string";
  for (const [endpointName, endpointFn] of Object.entries(placed.group)) {
    if (endpointName === "options" || !isEndpoint(endpointFn)) continue;
    if (!exact) {
      analyzeEndpoint(routes, placed.path, endpointName, endpointFn, base);
      continue;
    }
    const transport = extractSchema(endpointFn)?.transport;
    const probed =
      transport === "sse" || transport === "ws" ? undefined : probeEndpoint(endpointFn);
    const declared = probed && splitQuery(probed.path ?? "");
    const at = declared ? rooted(declared.path, "") : undefined;
    const prefix = at ? normalizePrefix(`${base}/${at.collection}`) : base;
    const before = routes.length;
    const query = declared?.query ? `?${declared.query}` : "";
    analyzeEndpoint(
      routes,
      placed.path,
      endpointName,
      endpointFn,
      prefix,
      at && { ...probed, path: `${at.path}${query}` },
    );
    for (const route of routes.slice(before)) route.exact = true;
  }
}

function analyzeEndpoint(
  routes: RouteInfo[],
  groupName: string,
  endpointName: string,
  endpointFn: unknown,
  prefix: string,
  preProbed?: { method?: string; path?: string },
): void {
  const schema = extractSchema(endpointFn);
  const transport = schema?.transport;

  // SSE/WS endpoints don't accept an http argument — skip probing to avoid
  // calling the generator/channel factory with garbage. They live at the
  // path they declare, where a direct client connects (`stream.get("feed")`
  // → /notifications/feed), or at their name when they declare none.
  if (transport === "sse" || transport === "ws") {
    const path = realtimePath(endpointFn, endpointName);
    const fullPath = `${prefix}/${path}`.replace(/\/+/g, "/");
    routes.push({
      group: groupName,
      endpoint: endpointName,
      httpMethod: "GET",
      prefix,
      path,
      fullPath,
      hasIdParam: false,
      operation: "custom",
      responseSchema: schema?.response,
      variablesSchema: schema?.variables,
      type: schema?.type,
      transport,
      isChannel: transport === "ws" && !!schema?.receive,
      ...(transport === "ws" && { channel: channelShape(endpointFn, schema) }),
    });
    return;
  }

  const probed = preProbed ?? probeEndpoint(endpointFn);
  const httpMethod = normalizeHttpMethod(probed.method ?? "GET");
  const declared = splitQuery(probed.path ?? "");
  const path = declared.path.split("/").filter(Boolean).join("/");
  const at = (path ? `${prefix}/${path}`.replace(/\/+/g, "/") : prefix) || "/";
  const fullPath = declared.query ? `${at}?${declared.query}` : at;
  const idParam = declared.fixed ? undefined : recordParam(path);

  routes.push({
    group: groupName,
    endpoint: endpointName,
    httpMethod,
    prefix,
    path,
    fullPath,
    hasIdParam: pathParamNames(path).length > 0,
    ...(idParam !== undefined && { idParam }),
    /* One of two operations at a path its query tells apart is no collection's CRUD. */
    operation: declared.fixed ? "custom" : detectOperation(httpMethod, path),
    ...(declared.fixed && { fixedQuery: declared.fixed }),
    responseSchema: schema?.response,
    variablesSchema: schema?.variables,
    type: schema?.type,
    transport: "http",
  });
}
