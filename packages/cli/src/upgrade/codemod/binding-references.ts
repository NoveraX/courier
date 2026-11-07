import { type AstNode, isNode, nameOf, type Visited, walk } from "./ast";
import { occurrencesOf } from "./identifier-roles";

const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
/* Where a `var` is declared: the function it is in — its body, which its parameters do not see — a class's static block, or the module's or a namespace's body. */
const VAR_SCOPES = new Set([...FUNCTIONS, "StaticBlock", "Program", "TSModuleBlock"]);
/* Where a `let`, a `const`, a class or a function declared in them is, beside a `var`'s: a switch's cases, not its test. */
const BLOCK_SCOPES = new Set([
  ...VAR_SCOPES,
  "BlockStatement",
  "SwitchStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "CatchClause",
]);
/* What a pattern's name is under, before the declaration it is in. */
const PATTERN_PARTS = new Set([
  "ObjectPattern",
  "ArrayPattern",
  "RestElement",
  "AssignmentPattern",
  "Property",
  "TSParameterProperty",
]);
const OWN_SCOPE = new Set(["FunctionExpression", "ClassExpression"]);
const DECLARED_AROUND = new Set([
  "FunctionDeclaration",
  "ClassDeclaration",
  "TSEnumDeclaration",
  "TSModuleDeclaration",
  "TSImportEqualsDeclaration",
  "ImportSpecifier",
  "ImportDefaultSpecifier",
  "ImportNamespaceSpecifier",
]);

/* Whether a node is in a switch's test, which its cases' declarations do not close off. */
function inTest(node: AstNode, scope: AstNode): boolean {
  const test = scope.type === "SwitchStatement" ? scope.discriminant : undefined;
  return isNode(test) && node.start >= test.start && node.end <= test.end;
}

/* The nearest of the nodes above, from one of them up, of the kinds given. */
function nearest(ancestors: readonly AstNode[], from: number, kinds: ReadonlySet<string>) {
  for (let at = from; at >= 0; at--) {
    const node = ancestors[at];
    if (node !== undefined && kinds.has(node.type)) return node;
  }
  return undefined;
}

/* The scope a binding of a value is declared in: none for one of a type alone, or one not told. */
function scopeOf(binding: AstNode, ancestors: readonly AstNode[]): AstNode | undefined {
  let at = ancestors.length - 1;
  while (at >= 0 && PATTERN_PARTS.has(ancestors[at]?.type ?? "")) at--;
  const owner = ancestors[at];
  if (owner === undefined) return undefined;
  if (owner.type === "VariableDeclarator") {
    const kind = ancestors[at - 1]?.kind;
    const scope = nearest(ancestors, at - 2, kind === "var" ? VAR_SCOPES : BLOCK_SCOPES);
    const body = scope !== undefined && FUNCTIONS.has(scope.type) ? scope.body : undefined;
    return isNode(body) && body.type === "BlockStatement" ? body : scope;
  }
  const named = owner.id === binding;
  if (named && OWN_SCOPE.has(owner.type)) return owner;
  if ((named || !("params" in owner)) && DECLARED_AROUND.has(owner.type))
    return nearest(ancestors, at - 1, BLOCK_SCOPES);
  if (owner.type === "CatchClause" || (!named && VAR_SCOPES.has(owner.type))) return owner;
  return undefined;
}

/**
 * The references to a binding of a value: each identifier of its name
 * in the scope it is declared in — a function's body, a block, the
 * module — but those an inner declaration of the same name closes off,
 * a parameter, a variable, a function, a class or a catch's: a `var` or
 * a function in a function's body closes off nothing of its parameters,
 * a declaration in a switch's cases nothing of its test. Where the
 * binding's scope is not told, every reference of its name is: the
 * caller reads more of them, never fewer.
 *
 * @param program - The file's tree
 * @param binding - The binding's identifier: an import's, a declarator's
 * @returns Each reference, with the nodes above it and the field it is under
 * @example
 * ```ts
 * referencesTo(program, declarator.id).length; // 1 for `const ns = await import("x"); ns.a;` beside `(ns) => ns`
 * ```
 */
export function referencesTo(program: AstNode, binding: AstNode): Visited[] {
  const name = nameOf(binding);
  if (name === undefined) return [];
  const roles = new Map(occurrencesOf(program, name).map((each) => [each.node, each.role]));
  const scopes = new Map<AstNode, AstNode>();
  const references: Visited[] = [];
  walk(program, ({ node, ancestors, key }) => {
    const role = roles.get(node);
    if (role === "reference") references.push({ node, ancestors: [...ancestors], key });
    if (role !== "binding") return;
    const scope = scopeOf(node, ancestors);
    if (scope !== undefined) scopes.set(node, scope);
  });
  const own = scopes.get(binding);
  if (own === undefined) return references;
  const declaring = new Set(scopes.values());
  return references.filter(({ node, ancestors }) => {
    for (let at = ancestors.length - 1; at >= 0; at--) {
      const scope = ancestors[at];
      if (scope === undefined || !declaring.has(scope) || inTest(node, scope)) continue;
      return scope === own;
    }
    return false;
  });
}
