import { type AstNode, isNode, nameOf } from "./ast";
import { courierHeadOf } from "./courier-heads";
import { namedImports, sourceOf } from "./imports";

/**
 * The modules of Courier's a file imports from: what its calls may be
 * traced to.
 *
 * @param program - The file's tree
 * @returns The modules, by the specifier the file writes
 */
export function courierModules(program: AstNode): Set<string> {
  const body = Array.isArray(program.body) ? program.body.filter(isNode) : [];
  return new Set(
    body.flatMap((each) => {
      const module = sourceOf(each);
      return module?.startsWith("@noverax/") ? [module] : [];
    }),
  );
}

/* The identifier a chain of calls and members starts from: `endpoint` of endpoint.get("x").retry({…}). */
function rootOf(node: unknown): string | undefined {
  let at: unknown = node;
  while (isNode(at) && (at.type === "MemberExpression" || at.type === "CallExpression"))
    at = at.type === "MemberExpression" ? at.object : at.callee;
  return nameOf(at);
}

/**
 * Whether a call is of a method on a chain that starts from a head of
 * `courier()`, or from a value imported from one of Courier's modules —
 * an endpoint builder's `.retry()` — so the method is Courier's for
 * certain.
 *
 * @param program - The file's tree
 * @param call - The call
 * @param method - The method's name
 * @returns Whether it is
 * @example
 * ```ts
 * isCourierMethod(program, call, "retry"); // true for const { endpoint } = courier(); endpoint.get("users").retry({ limit: 3 })
 * ```
 */
export function isCourierMethod(program: AstNode, call: AstNode, method: string): boolean {
  const { callee } = call;
  if (!isNode(callee) || callee.type !== "MemberExpression" || nameOf(callee.property) !== method)
    return false;
  if (courierHeadOf(program, callee.object) !== undefined) return true;
  const root = rootOf(callee.object);
  if (root === undefined) return false;
  return namedImports(program, courierModules(program)).some(
    (each) => each.kind === "import" && each.local === root,
  );
}

/**
 * The quote a file writes its imports' modules with: what a string a
 * codemod adds is written with.
 *
 * @param program - The file's tree
 * @param text - The file's text
 * @returns `"` or `'`
 */
export function quoteOf(program: AstNode, text: string): string {
  const body = Array.isArray(program.body) ? program.body.filter(isNode) : [];
  const source = body.map((each) => each.source).find(isNode);
  return source !== undefined && text[source.start] === "'" ? "'" : '"';
}
