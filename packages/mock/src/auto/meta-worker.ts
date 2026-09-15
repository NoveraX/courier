/**
 * Persistent child process for extracting mock server metadata.
 * Spawned once by studio scanner, handles N requests via IPC — no cold start per file.
 *
 * IPC protocol:
 *   Parent → Worker: { type: "analyze", id, configPath, mockKey }
 *   Worker → Parent: { type: "result", id, meta }
 *   Parent → Worker: { type: "shutdown" }
 *   Worker → Parent: { type: "ready" }
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { MockScenario } from "../types";
import { generateRecords } from "./data-generator";
import type { RouteInfo } from "./route-analyzer";
import { analyzeRoutes, getSourceGroupNames } from "./route-analyzer";
import { introspectScenario } from "./scenario-introspect";
import { analyzeField, extractShape, unwrapArraySchema } from "./schema-introspect";

function serializeSchema(schema: StandardSchemaV1): Record<string, string> | undefined {
  const item = unwrapArraySchema(schema) ?? schema;
  const shape = extractShape(item);
  if (!shape) return undefined;

  const result: Record<string, string> = {};
  for (const [key, field] of Object.entries(shape)) {
    const info = analyzeField(field);
    result[key] =
      info.type === "optional" || info.type === "nullable"
        ? `${info.innerField?.type ?? "unknown"}?`
        : info.type;
  }
  return result;
}

function buildRouteEntry(route: RouteInfo, groupNames: Set<string>): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    group: groupNames.has(route.group) ? route.group : "",
    endpoint: route.endpoint,
    httpMethod: route.httpMethod,
    path: route.path,
    fullPath: route.fullPath,
    source: "auto",
    hits: 0,
  };

  if (route.responseSchema) {
    entry.responseSchema = serializeSchema(route.responseSchema);
    try {
      const records = generateRecords(route.responseSchema, 1);
      entry.exampleResponse = route.operation === "list" ? records : records[0];
    } catch {
      /* schema may not support generation */
    }
  }
  return entry;
}

async function analyze(
  configPath: string,
  mockKey: string,
): Promise<Record<string, unknown> | null> {
  // Timestamp query busts ESM cache on file changes
  const mod = await import(`${configPath}?t=${Date.now()}`);
  const root = (mod.default ?? mod) as { mocks?: Record<string, unknown> } | undefined;
  const config = root?.mocks?.[mockKey] as
    | {
        source?: Record<string, unknown>;
        autoStart?: boolean;
        scenarios?: Record<string, unknown>;
      }
    | undefined;
  const source = config?.source;
  if (!source) return null;

  const routes = analyzeRoutes(source);
  const groupNames = getSourceGroupNames(source);
  const collections = [...new Set(routes.map((r) => r.group).filter(Boolean))];

  // Build all scenarios (built-ins + user-defined) for introspection
  const { buildPresetScenarios } = await import("./preset-scenarios");
  const { buildAutoScenario } = await import("./auto-scenario");

  const autoScenario = buildAutoScenario(routes);
  // No store in meta-worker (introspection only) — slow-network will return [] if called
  const presets = buildPresetScenarios(routes, () => undefined);
  const allScenarios = {
    "happy-path": autoScenario,
    ...presets,
    ...(config?.scenarios ?? {}),
  };

  const scenarios = Object.entries(allScenarios).map(([name, scenario]) => {
    const result = introspectScenario(scenario as MockScenario, routes);
    return {
      name,
      endpointCount: result.endpoints.length,
      isActive: false,
      hasStateMachine: result.hasStateMachine,
      stateTransitions: result.stateTransitions,
      endpoints: result.endpoints,
    };
  });

  return {
    autoStart: config?.autoStart === true,
    routes: routes.map((r) => buildRouteEntry(r, groupNames)),
    collections,
    scenarios,
  };
}

process.on("message", (msg: unknown) => {
  const req = msg as { type: string };

  if (req.type === "analyze") {
    const { id, configPath, mockKey } = msg as {
      type: "analyze";
      id: string;
      configPath: string;
      mockKey: string;
    };
    analyze(configPath, mockKey)
      .then((meta) => {
        process.send?.({ type: "result", id, meta });
      })
      .catch(() => {
        process.send?.({ type: "result", id, meta: null });
      });
  } else if (req.type === "shutdown") {
    process.exit(0);
  }
});

process.send?.({ type: "ready" });
