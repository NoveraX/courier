import type { Expression, ObjectExpression, ObjectProperty } from "oxc-parser";

import { boundValue, type Placed } from "./bound-value";
import type { SourceModules } from "./source-modules";
import { keyName } from "./written-schema";

/** An object literal, and the module it is written in. */
export interface PlacedObject {
  readonly path: string;
  readonly literal: ObjectExpression;
}

/** An endpoint as its source writes it: its property in an `endpoints` object, and that object's module. */
export interface DeclaredEndpoint {
  readonly path: string;
  readonly property: ObjectProperty;
}

/**
 * Where an endpoint is declared: its property in the `endpoints` of its
 * group — `place: endpoint.post(…)` — found from the config's default
 * export through `sources`, then `groups` — groups inside groups — and
 * `endpoints`, each written in place or bound to a name in this module or
 * one it imports.
 *
 * @param modules - The project's modules
 * @param configFile - The config's absolute path
 * @param source - The source's name in the config's `sources`
 * @param endpoint - The endpoint's call: `products.get`, `billing.invoices.list`, `health`
 * @returns The property and its module, or why Studio did not find it
 * @example
 * ```ts
 * declarationOf(modules, "/app/courier.config.ts", "shop", "orders.place");
 * ```
 */
export function declarationOf(
  modules: SourceModules,
  configFile: string,
  source: string,
  endpoint: string,
): DeclaredEndpoint | { why: string } {
  const names = endpoint.split(".");
  const endpoints = endpointsOf(modules, configFile, source, names.slice(0, -1));
  if ("why" in endpoints) return endpoints;
  const property = propertyNamed(endpoints, names.at(-1) ?? "");
  return property === undefined
    ? { why: `Studio could not read how ${source} declares ${endpoint}` }
    : { path: endpoints.path, property };
}

/**
 * The `endpoints` object of a source or of one of its groups, where an
 * endpoint of it is declared.
 *
 * @param modules - The project's modules
 * @param configFile - The config's absolute path
 * @param source - The source's name in the config's `sources`
 * @param groups - The group's names from the source down; none for the source itself
 * @returns The object and its module, or why Studio did not find it
 * @example
 * ```ts
 * endpointsOf(modules, "/app/courier.config.ts", "shop", ["orders"]);
 * ```
 */
export function endpointsOf(
  modules: SourceModules,
  configFile: string,
  source: string,
  groups: readonly string[],
): PlacedObject | { why: string } {
  const config = configObject(modules, configFile);
  if (config === undefined) return { why: "Studio could not read the config's default export" };
  const sources = objectAt(modules, propertyValue(config, "sources"));
  const api = sources && objectAt(modules, propertyValue(sources, source));
  if (api === undefined) return { why: `Studio could not read how the config declares ${source}` };
  let holder = api;
  for (const group of groups) {
    const inner = objectAt(modules, propertyValue(holder, "groups"));
    const next = inner && objectAt(modules, propertyValue(inner, group));
    if (next === undefined)
      return { why: `Studio could not read how ${source} declares its ${group} group` };
    holder = next;
  }
  const endpoints = objectAt(modules, propertyValue(holder, "endpoints"));
  const name = [source, ...groups].join(".");
  return endpoints ?? { why: `Studio could not read the endpoints of ${name}` };
}

function configObject(modules: SourceModules, configFile: string): PlacedObject | undefined {
  const program = modules.module(configFile)?.program;
  for (const statement of program?.body ?? []) {
    if (statement.type !== "ExportDefaultDeclaration") continue;
    const value = statement.declaration;
    if (/Declaration$/.test(value.type)) return undefined;
    return objectAt(modules, { path: configFile, node: value as Expression });
  }
  return undefined;
}

/* An object literal an expression is, or is made from: written in place, bound to a name, or passed to `defineApi(…)`. */
function objectAt(modules: SourceModules, placed: Placed | undefined): PlacedObject | undefined {
  if (placed === undefined) return undefined;
  const node = placed.node;
  if (node.type === "ObjectExpression") return { path: placed.path, literal: node };
  if (node.type === "Identifier")
    return objectAt(modules, boundValue(modules, placed.path, node.name));
  if (
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "ParenthesizedExpression"
  ) {
    return objectAt(modules, { path: placed.path, node: node.expression });
  }
  if (node.type !== "CallExpression") return undefined;
  const [first] = node.arguments;
  return first === undefined || first.type === "SpreadElement"
    ? undefined
    : objectAt(modules, { path: placed.path, node: first });
}

function propertyNamed(object: PlacedObject, key: string): ObjectProperty | undefined {
  for (const property of object.literal.properties) {
    if (property.type === "Property" && !property.computed && keyName(property) === key) {
      return property;
    }
  }
  return undefined;
}

function propertyValue(object: PlacedObject | undefined, key: string): Placed | undefined {
  const property = object && propertyNamed(object, key);
  return property && object ? { path: object.path, node: property.value } : undefined;
}
