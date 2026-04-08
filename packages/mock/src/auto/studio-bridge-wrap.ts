import { getSourceName } from "@noverax/nexus/define";

import type { MockServer } from "../server/create-mock-server";
import { connectMockToStudio } from "../studio/bridge";
import type { MockRouteInfo } from "../studio/types";
import type { MockScenario } from "../types";
import { generateRecords } from "./data-generator";
import type { RouteInfo } from "./route-analyzer";
import { analyzeField, extractShape, unwrapArraySchema } from "./schema-introspect";

/**
 * Studio integration glue for the auto mock server.
 *
 * Extracted from `create-auto-server.ts` because everything related to
 * Studio (wrapping `server.start`, building serializable RouteInfo entries,
 * shape serialization for the UI) is independent from the core mock-server
 * orchestration. Pulling it into its own module keeps `createAutoMockServer`
 * focused on assembling the server itself.
 */

/** Minimal subset of AutoMockServerConfig needed by the Studio wrapper */
export interface StudioWrapConfig {
  studio?: boolean | { host?: string; port?: number; name?: string };
  source: Record<string, unknown>;
}

/** Wrap server.start() to auto-connect to Studio after listening */
export function wrapStartWithStudio(
  server: MockServer,
  config: StudioWrapConfig,
  routeEntries: MockRouteInfo[],
  analyzedRoutes: RouteInfo[],
  allScenarios: Record<string, MockScenario>,
  reseed: () => void,
): void {
  const originalStart = server.start.bind(server);

  server.start = async () => {
    const info = await originalStart();

    const studioOpts = typeof config.studio === "object" ? config.studio : {};
    const sourceName = getSourceName(config.source) ?? "mock";
    void connectMockToStudio(server, {
      name: studioOpts.name ?? sourceName,
      host: studioOpts.host,
      port: studioOpts.port,
      serverPort: info.port,
      serverUrl: info.url,
      routeCount: routeEntries.length,
      routes: routeEntries,
      analyzedRoutes,
      scenarios: Object.keys(allScenarios),
      scenarioMap: allScenarios,
      reseed,
    });

    return info;
  };
}

/** Convert analyzed RouteInfo → serializable MockRouteInfo with schema + example */
export function toRouteInfo(r: RouteInfo, groupNames: Set<string>): MockRouteInfo {
  const entry: MockRouteInfo = {
    group: groupNames.has(r.group) ? r.group : "",
    endpoint: r.endpoint,
    httpMethod: r.httpMethod,
    path: r.path,
    fullPath: r.fullPath,
    source: "auto",
    hits: 0,
  };

  if (r.responseSchema) {
    entry.responseSchema = serializeSchema(r.responseSchema);
    try {
      const records = generateRecords(r.responseSchema, 1);
      entry.exampleResponse = r.operation === "list" ? records : records[0];
    } catch {
      // Schema may not be introspectable — skip example
    }
  }

  return entry;
}

/** Serialize Standard Schema shape → simple { field: type } map for UI display */
function serializeSchema(schema: unknown): Record<string, string> | undefined {
  const itemSchema = unwrapArraySchema(schema) ?? schema;
  const shape = extractShape(itemSchema);
  if (!shape) return undefined;

  const result: Record<string, string> = {};
  for (const [key, field] of Object.entries(shape)) {
    const meta = analyzeField(field);
    result[key] =
      meta.type === "optional" || meta.type === "nullable"
        ? `${meta.innerField?.type ?? "unknown"}?`
        : meta.type;
  }
  return result;
}
