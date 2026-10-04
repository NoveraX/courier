import { isPlainObject } from "@/socket/is-plain-object";
import type { MockRouteEntry } from "../mock-slice-types";
import { readStringRecord } from "./read-string-record";

const SOURCES = ["auto", "override", "scenario"] as const;

/* A route that comes without its counts has served nothing yet. */
function readRoute(value: unknown): MockRouteEntry | undefined {
  if (!isPlainObject(value)) return undefined;
  const { group, endpoint, httpMethod, path, fullPath, source, hits, avgLatency } = value;
  if (typeof group !== "string" || typeof endpoint !== "string") return undefined;
  if (typeof httpMethod !== "string" || typeof path !== "string") return undefined;
  if (typeof fullPath !== "string") return undefined;
  const from = SOURCES.find((candidate) => candidate === source);
  if (from === undefined) return undefined;
  if (hits !== undefined && typeof hits !== "number") return undefined;
  if (avgLatency !== undefined && typeof avgLatency !== "number") return undefined;
  const schema =
    value.responseSchema === undefined ? undefined : readStringRecord(value.responseSchema);
  if (value.responseSchema !== undefined && schema === undefined) return undefined;
  return {
    group,
    endpoint,
    httpMethod,
    path,
    fullPath,
    source: from,
    hits: hits ?? 0,
    avgLatency: avgLatency ?? 0,
    ...(schema && { responseSchema: schema }),
    ...("exampleResponse" in value && { exampleResponse: value.exampleResponse }),
  };
}

/**
 * A mock's routes from a socket event, or `undefined` when the field is not
 * a list of routes.
 *
 * @param value - The field as the socket parsed it
 * @returns The routes, a route without counts given none
 * @example
 * ```ts
 * readMockRoutes([{ group: "users", endpoint: "list", httpMethod: "GET", path: "",
 *   fullPath: "/users", source: "auto" }]); // → [{ …, hits: 0, avgLatency: 0 }]
 * ```
 */
export function readMockRoutes(value: unknown): MockRouteEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: unknown[] = value;
  const routes: MockRouteEntry[] = [];
  for (const item of items) {
    const route = readRoute(item);
    if (route === undefined) return undefined;
    routes.push(route);
  }
  return routes;
}
