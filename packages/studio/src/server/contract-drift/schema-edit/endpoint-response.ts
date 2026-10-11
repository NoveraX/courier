import type { Expression } from "oxc-parser";

import type { Placed } from "./bound-value";
import { declarationOf } from "./endpoint-declaration";
import type { SourceModules } from "./source-modules";

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
  const declared = declarationOf(modules, configFile, source, endpoint);
  if ("why" in declared) return declared;
  const response = responseArgument(declared.property.value);
  return response === undefined
    ? { why: `${source}.${endpoint} has no .response(…) Studio can read` }
    : { path: declared.path, node: response };
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
