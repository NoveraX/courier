import { type AstNode, isNode, nameOf, walk } from "../codemod/ast";
import { keyOf } from "../codemod/literals";
import { CORE_ROOT } from "../entries/entry-names";
import type { TakenName } from "./entry-findings";
import { membersOf, type Taken } from "./entry-taken";

/* The names an object pattern takes, each a value; `undefined` where a rest or a computed key hides some. */
function patternNames(pattern: unknown): TakenName[] | undefined {
  if (!isNode(pattern) || pattern.type !== "ObjectPattern") return undefined;
  const properties = Array.isArray(pattern.properties) ? pattern.properties : [];
  const names: TakenName[] = [];
  for (const property of properties) {
    const plain = isNode(property) && property.type === "Property" && property.computed !== true;
    const name = plain ? keyOf(property.key) : undefined;
    if (name === undefined) return undefined;
    names.push({ name, type: false });
  }
  return names;
}

/* The names what a load gives is taken by: a destructuring of it, of what awaiting it gives, or of the module `.then()` hands a function; the members a binding of it is used by in its scope. */
function namesOf(
  program: AstNode,
  call: AstNode,
  ancestors: readonly AstNode[],
): TakenName[] | undefined {
  let at = ancestors.length - 1;
  let value = call;
  const awaited = ancestors[at];
  if (awaited?.type === "AwaitExpression" && awaited.argument === call) {
    value = awaited;
    at--;
  }
  const parent = ancestors[at];
  if (parent?.type === "VariableDeclarator" && parent.init === value) {
    const { id } = parent;
    return isNode(id) && nameOf(id) !== undefined ? membersOf(program, id) : patternNames(id);
  }
  const then = parent?.type === "MemberExpression" && parent.object === call;
  const handed = ancestors[at - 1];
  if (!then || nameOf(parent.property) !== "then" || handed?.type !== "CallExpression")
    return undefined;
  const [handler] = Array.isArray(handed.arguments) ? handed.arguments : [];
  const [module] = isNode(handler) && Array.isArray(handler.params) ? handler.params : [];
  return handed.callee === parent ? patternNames(module) : undefined;
}

/**
 * Each `import()` and `require()` of the root in a piece of code, as a
 * declaration takes the root: the string it names it by, and the names
 * what it loads is taken by, where they are in sight — a destructuring
 * of what it gives, of what awaiting it gives, or of the module
 * `.then()` hands a function, or the members a binding of it is used
 * by in the scope that declares it, past another binding of its name.
 *
 * @param program - The piece's tree
 * @returns The loads
 * @example
 * ```ts
 * rootLoads(program)[0]?.names; // [{ name: "isHTTPError", type: false }] for `const { isHTTPError } = await import("@noverax/courier")`
 * ```
 */
export function rootLoads(program: AstNode): Taken[] {
  const loads: Taken[] = [];
  walk(program, ({ node, ancestors }) => {
    const required = node.type === "CallExpression" && nameOf(node.callee) === "require";
    const [first] = required && Array.isArray(node.arguments) ? node.arguments : [];
    const source = node.type === "ImportExpression" ? node.source : first;
    if (!isNode(source) || source.type !== "Literal" || source.value !== CORE_ROOT) return;
    loads.push({
      statement: node,
      source,
      call: required ? "require()" : "import()",
      names: namesOf(program, node, ancestors),
      star: false,
      typesAlone: undefined,
    });
  });
  return loads;
}
