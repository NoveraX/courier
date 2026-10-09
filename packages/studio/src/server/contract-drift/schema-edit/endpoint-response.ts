import type { Expression, ObjectExpression } from "oxc-parser";

import { boundValue, type Placed } from "./bound-value";
import type { SourceModules } from "./source-modules";
import { keyName } from "./written-schema";

/** An object literal, and the module it is written in. */
interface PlacedObject {
  readonly path: string;
  readonly literal: ObjectExpression;
}

/**
 * Where an endpoint's response schema is written: the argument of its
 * `.response(…)`, found from the config's default export through
 * `sources`, then `groups` — groups inside groups — and `endpoints`, each
 * written in place or bound to a name in this module or one it imports.
 *
 * @param modules - The project's modules
 * @param configFile - The config's absolute path
 * @param source - The source's name in the config's `sources`
 * @param endpoint - The endpoint's call: `products.get`, `billing.invoices.list`, `health`
 * @returns The schema's expression, or why Studio did not find it
 * @example
 * ```ts
 * responseOf(modules, "/app/courier.config.ts", "shop", "products.get");
 * ```
 */
export function responseOf(
  modules: SourceModules,
  configFile: string,
  source: string,
  endpoint: string,
): Placed | { why: string } {
  const config = configObject(modules, configFile);
  if (config === undefined) return { why: "Studio could not read the config's default export" };
  const sources = objectAt(modules, propertyValue(config, "sources"));
  const api = sources && objectAt(modules, propertyValue(sources, source));
  if (api === undefined) return { why: `Studio could not read how the config declares ${source}` };
  const names = endpoint.split(".");
  let holder = api;
  for (const group of names.slice(0, -1)) {
    const groups = objectAt(modules, propertyValue(holder, "groups"));
    const next = groups && objectAt(modules, propertyValue(groups, group));
    if (next === undefined)
      return { why: `Studio could not read how ${source} declares its ${group} group` };
    holder = next;
  }
  const endpoints = objectAt(modules, propertyValue(holder, "endpoints"));
  const declared = endpoints && propertyValue(endpoints, names.at(-1) ?? "");
  if (declared === undefined)
    return { why: `Studio could not read how ${source} declares ${endpoint}` };
  const response = responseArgument(declared.node);
  return response === undefined
    ? { why: `${source}.${endpoint} has no .response(…) Studio can read` }
    : { path: declared.path, node: response };
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

function propertyValue(object: PlacedObject | undefined, key: string): Placed | undefined {
  if (object === undefined) return undefined;
  for (const property of object.literal.properties) {
    if (property.type === "Property" && !property.computed && keyName(property) === key) {
      return { path: object.path, node: property.value };
    }
  }
  return undefined;
}

/* The argument of the chain's `.response(…)`: `endpoint.get(":id").response(Product).agent(…)`. */
function responseArgument(node: Expression): Expression | undefined {
  let current: Expression = node;
  while (current.type === "CallExpression" && current.callee.type === "MemberExpression") {
    const { callee } = current;
    const [argument] = current.arguments;
    if (
      !callee.computed &&
      callee.property.type === "Identifier" &&
      callee.property.name === "response"
    ) {
      return argument === undefined || argument.type === "SpreadElement" ? undefined : argument;
    }
    current = callee.object;
  }
  return undefined;
}
