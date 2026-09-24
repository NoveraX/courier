import { composeScenarios } from "../auto/compose-scenarios";
import { buildPresetScenarios } from "../auto/preset-scenarios";
import { analyzeRoutes, getSourceGroupNames } from "../auto/route-analyzer";
import type { DescribedRoute } from "./describe-route";
import { describeRoute } from "./describe-route";
import { buildScenarioMeta } from "./scenario-meta";
import type { ChildScenarioMeta, MockServerDefinition } from "./types";

/** What Studio shows of a declared mock server without starting it. */
export interface MockServerDescription {
  autoStart: boolean;
  /** The port the definition names; absent when it names none. */
  port?: number;
  routes: DescribedRoute[];
  collections: string[];
  scenarios: ChildScenarioMeta[];
}

/**
 * Describe a mock server definition: its routes, collections and scenarios,
 * and how it wants to be started.
 *
 * Studio reads this from the definition it already holds, to list a declared
 * mock before it runs. Scenarios are read by running them against a recorder;
 * one that cannot be read to the end is still listed, with the reason in its
 * `introspectionError`.
 *
 * @param definition - What `defineMockServer` returned.
 * @returns The description.
 * @throws When the definition has no source, or its routes cannot be read from it.
 *
 * @example
 * ```ts
 * const description = describeMockServer(defineMockServer({ source: api, port: 7001 }));
 * description.routes.map((route) => `${route.httpMethod} ${route.fullPath}`);
 * // ["GET /users", "GET /users/:id", …]
 * ```
 */
export function describeMockServer(definition: MockServerDefinition): MockServerDescription {
  const source: Record<string, unknown> | undefined = definition.source;
  if (!source) throw new Error("The mock server has no source. Pass one to defineMockServer().");
  const routes = analyzeRoutes(source);
  const groupNames = getSourceGroupNames(source);
  /* Composed the way the running server composes them, so the list Studio
     shows before a mock starts is the one it has once it runs. */
  const scenarios = composeScenarios(
    buildPresetScenarios(routes, () => undefined),
    definition.scenarios,
  );

  return {
    autoStart: definition.autoStart === true,
    ...(definition.port !== undefined && definition.port > 0 ? { port: definition.port } : {}),
    routes: routes.map((route) => describeRoute(route, groupNames)),
    collections: [...new Set(routes.map((r) => r.group).filter(Boolean))],
    scenarios: buildScenarioMeta(scenarios, routes),
  };
}
