import type { Expression } from "oxc-parser";
import type { MockImports } from "./read-mock-imports";
import { unwrapExpression } from "./unwrap-expression";

/**
 * Whether a callee refers to a function the mock package exports: a local
 * name it was imported under, or `namespace.name`.
 *
 * @param callee - The callee of a call expression
 * @param name - `defineMocks` or `defineMockServer`
 * @param imports - What the module imports from the mock package
 * @returns Whether calling `callee` calls that function
 *
 * @example
 * ```ts
 * // import * as mock from "@noverax/courier-mock";  …  mock.defineMockServer({ … })
 * isMockCallee(call.callee, "defineMockServer", imports); // → true
 * ```
 */
export function isMockCallee(callee: Expression, name: string, imports: MockImports): boolean {
  const target = unwrapExpression(callee);
  if (target.type === "Identifier") return imports.named.get(name)?.includes(target.name) ?? false;
  if (target.type !== "MemberExpression" || target.computed || target.optional) return false;
  if (target.object.type !== "Identifier" || target.property.type !== "Identifier") return false;
  return target.property.name === name && imports.namespaces.includes(target.object.name);
}
