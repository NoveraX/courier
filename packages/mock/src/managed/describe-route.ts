import type { StandardSchemaV1 } from "@standard-schema/spec";
import { generateRecords } from "../auto/data-generator";
import type { RouteInfo } from "../auto/route-types";
import { analyzeField, extractShape, unwrapArraySchema } from "../auto/schema-introspect";
import type { MockServer } from "../server/mock-server-types";

/** What answers a route: generated CRUD, an override, or the active scenario. */
export type RouteSource = ReturnType<MockServer["getRouteSource"]>;

/** One route of a mock server, as Studio lists it. */
export interface DescribedRoute {
  group: string;
  endpoint: string;
  httpMethod: string;
  path: string;
  fullPath: string;
  source: RouteSource;
  hits: number;
  avgLatency: number;
  /** Field names and types of the response, when the source gives a schema. */
  responseSchema?: Record<string, string>;
  /** A generated response, when the source gives a schema. */
  exampleResponse?: unknown;
}

/**
 * Describe one route: where it is, and what it answers with.
 *
 * The same description serves a mock before it starts and while it runs, so
 * the schema and example Studio shows do not change when it starts.
 *
 * @param route - The route, as the source defines it
 * @param groupNames - The source's group names; an ungrouped endpoint is listed without one
 * @param source - What answers the route
 * @returns The route as Studio lists it
 */
export function describeRoute(
  route: RouteInfo,
  groupNames: ReadonlySet<string>,
  source: RouteSource = "auto",
): DescribedRoute {
  const described: DescribedRoute = {
    group: groupNames.has(route.group) ? route.group : "",
    endpoint: route.endpoint,
    httpMethod: route.httpMethod,
    path: route.path,
    fullPath: route.fullPath,
    source,
    hits: 0,
    avgLatency: 0,
  };
  if (!route.responseSchema) return described;
  const records = generateRecords(route.responseSchema, 1);
  return {
    ...described,
    responseSchema: describeSchema(route.responseSchema),
    exampleResponse: route.operation === "list" ? records : records[0],
  };
}

function describeSchema(schema: StandardSchemaV1): Record<string, string> | undefined {
  const shape = extractShape(unwrapArraySchema(schema) ?? schema);
  if (!shape) return undefined;
  const fields: Record<string, string> = {};
  for (const [key, field] of Object.entries(shape)) {
    const info = analyzeField(field);
    const optional = info.type === "optional" || info.type === "nullable";
    fields[key] = optional ? `${info.innerField?.type ?? "unknown"}?` : info.type;
  }
  return fields;
}
