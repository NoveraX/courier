import { type AstNode, isNode, nameOf, unparenthesized, walk } from "../codemod/ast";
import { referencesTo } from "../codemod/binding-references";
import { keyOf } from "../codemod/literals";
import { builtFrom, functionOf, type StartNames, WRAPPERS } from "./start-calls";

/** A side TanStack Start builds a module for: a page's bundle, or the server's. */
export type StartSide = "page" | "server";

/** What a module's split reads of it: the names its top gives, the objects Start's router reads as a route's options there, and, where it takes a function another module gives for one of Start's, those it took, by name, with the module each comes from. */
export interface StartRead {
  readonly names: StartNames;
  readonly options: ReadonlySet<AstNode>;
  readonly guessed: Map<string, string> | undefined;
  /** The functions of other modules it did not follow that it met where a call it reads may take code out, by name, with the module each comes from. */
  readonly met: Map<string, string>;
}

/* What a function another module gives is read as, where the split guesses: by its method alone. */
const ELSEWHERE = "elsewhere";

/* The method a chain's last call names, by the function it starts from, that makes it one the compiler splits; one another module gives is read by its method alone, where the split guesses. */
const LAST: Readonly<Record<string, ReadonlySet<string>>> = {
  createServerFn: new Set(["handler"]),
  createMiddleware: new Set(["server", "client", "createMiddlewares"]),
  createStart: new Set(["server", "client", "createMiddlewares"]),
  createIsomorphicFn: new Set(["server", "client"]),
  [ELSEWHERE]: new Set(["handler", "server"]),
};
/* The functions the compiler takes by a direct call. */
const DIRECT = new Set(["createServerOnlyFn", "createClientOnlyFn"]);
/* A route's options Start's router takes out of a page's build, and the routes whose options a second call gives. */
const ROUTE_DROPS = new Set(["server", "ssr", "headers"]);
const CURRIED_ROUTES = new Set(["createFileRoute", "createRootRouteWithContext"]);

/**
 * Whether a node lies within another, by where each is in the text.
 *
 * @param node - The node
 * @param part - The node it may lie within
 * @returns Whether it does
 * @example
 * ```ts
 * inside(reference, call.arguments[0]); // true for `createCaller` in `….handler(() => createCaller({}))`
 * ```
 */
export function inside(node: AstNode, part: unknown): boolean {
  return isNode(part) && part.start <= node.start && node.end <= part.end;
}

/* A chain of calls the compiler reads from its last: the function it starts from, through the module's bindings, whether the last call is that function's own, and each method's call by its name — the innermost where a chain names one twice. */
function chainOf(names: StartNames, last: AstNode) {
  const calls = new Map<string, AstNode>();
  let at = last;
  for (;;) {
    const from = functionOf(names, at.callee, true);
    if (from !== undefined) return { from, direct: at === last, calls };
    const callee = unparenthesized(at.callee);
    if (!isNode(callee) || callee.type !== "MemberExpression") return undefined;
    const method = callee.computed === true ? undefined : nameOf(callee.property);
    if (method !== undefined) calls.set(method, at);
    const object = unparenthesized(callee.object);
    if (!isNode(object) || object.type !== "CallExpression") {
      const built = builtFrom(names, object);
      return built === undefined ? undefined : { from: built, direct: false, calls };
    }
    at = object;
  }
}

/* Whether a call is the value of a declaration at the module's top, where the compiler takes a direct call by any name it resolves. */
function atTop(ancestors: readonly AstNode[], at: number): boolean {
  let up = at - 1;
  while (WRAPPERS.has(ancestors[up]?.type ?? "")) up--;
  if (ancestors[up]?.type !== "VariableDeclarator") return false;
  const parent = ancestors[up - 2]?.type;
  return parent === "Program" || (parent === "ExportNamedDeclaration" && up === 3);
}

/* The sides whose build drops a reference in a call, the last of its chain, as Start's compiler splits it. A direct call is one by a factory's own name, or by any name at the module's top. */
function dropsIn(
  read: StartRead,
  ancestors: readonly AstNode[],
  at: number,
  node: AstNode,
): StartSide[] {
  const last = ancestors[at] as AstNode;
  const chain = chainOf(read.names, last);
  if (chain === undefined) return [];
  const { direct, calls } = chain;
  const from = typeof chain.from === "string" ? chain.from : ELSEWHERE;
  const callee = unparenthesized(last.callee);
  const member = isNode(callee) && callee.type === "MemberExpression" ? callee : undefined;
  if (direct) {
    const named = member === undefined ? nameOf(callee) : nameOf(member.property);
    const simple =
      named !== undefined && (member === undefined || nameOf(member.object) !== undefined);
    if (!DIRECT.has(from) || !(DIRECT.has(named ?? "") || (simple && atTop(ancestors, at))))
      return [];
    return from === "createServerOnlyFn" ? ["page"] : ["server"];
  }
  const method = member?.computed === true ? undefined : nameOf(member?.property);
  if (!LAST[from]?.has(method ?? "")) return [];
  if (typeof chain.from !== "string") {
    read.met.set(chain.from.elsewhere, chain.from.from);
    if (read.guessed === undefined) return [];
  }
  const given = (name: string, first = false) => {
    const args = calls.get(name)?.arguments;
    const list = Array.isArray(args) ? args : [];
    return (first ? list.slice(0, 1) : list).some((each) => inside(node, each));
  };
  if (from === "createIsomorphicFn")
    return (["page", "server"] as const).filter(
      (side) => !given(side === "page" ? "client" : "server", true),
    );
  const handler = from === "createServerFn" || (from === ELSEWHERE && method === "handler");
  const dropped = (handler ? given("handler", true) : given("server")) || given("validator");
  if (dropped && typeof chain.from !== "string")
    read.guessed?.set(chain.from.elsewhere, chain.from.from);
  return dropped ? ["page"] : [];
}

/**
 * The objects Start's router reads as a route's options in a module, as
 * its splitter finds them: what `createFileRoute(path)()` and
 * `createRootRouteWithContext()()` are called with, and a declaration's
 * `createRootRoute()` — the object written there, or the one a variable
 * named there is declared with, in the scope the call sees.
 *
 * @param program - The module's tree
 * @returns The objects
 * @example
 * ```ts
 * routeOptionsOf(program).size; // 1 for `const options = { … }; export const Route = createFileRoute("/")(options)`
 * ```
 */
export function routeOptionsOf(program: AstNode): Set<AstNode> {
  const options = new Set<AstNode>();
  const named: AstNode[] = [];
  const objects: AstNode[] = [];
  walk(program, ({ node, ancestors }) => {
    const init = unparenthesized(node.init);
    if (node.type === "VariableDeclarator" && isNode(init) && init.type === "ObjectExpression")
      objects.push(node);
    if (node.type !== "CallExpression") return;
    const callee = unparenthesized(node.callee);
    const parent = ancestors.findLast((each) => each.type !== "ParenthesizedExpression");
    const curried = isNode(callee) && callee.type === "CallExpression";
    const route = curried
      ? CURRIED_ROUTES.has(nameOf(unparenthesized(callee.callee)) ?? "")
      : nameOf(callee) === "createRootRoute" && parent?.type === "VariableDeclarator";
    const given = unparenthesized(Array.isArray(node.arguments) ? node.arguments[0] : undefined);
    if (route && isNode(given) && given.type === "ObjectExpression") options.add(given);
    if (route && isNode(given) && given.type === "Identifier") named.push(given);
  });
  for (const declarator of named.length === 0 ? [] : objects)
    if (
      isNode(declarator.id) &&
      referencesTo(program, declarator.id).some(({ node }) => named.includes(node))
    )
      options.add(unparenthesized(declarator.init) as AstNode);
  return options;
}

/**
 * The sides whose build drops a reference with a node above it, as
 * TanStack Start 1.169 builds the module: its compiler takes out of a
 * page a server function's handler and validator, what
 * `createServerOnlyFn` is given, and the `.server()` of
 * `createIsomorphicFn` and of `createMiddleware`, with the middleware's
 * validator — and out of the server what `createClientOnlyFn` is given,
 * the `.client()` of `createIsomorphicFn` and the children of Router's
 * `<ClientOnly>`; its router takes a route's `server`, `ssr` and
 * `headers` out of a page.
 *
 * @param read - What the split reads of the module
 * @param ancestors - The nodes above the reference
 * @param at - Which of them
 * @param node - The reference
 * @returns The sides whose build drops the reference with that node
 * @example
 * ```ts
 * dropsAt(read, ancestors, at, node); // ["page"] where the node is the last call of `createServerFn().handler(fn)` and the reference is in fn
 * ```
 */
export function dropsAt(
  read: StartRead,
  ancestors: readonly AstNode[],
  at: number,
  node: AstNode,
): readonly StartSide[] {
  const each = ancestors[at];
  if (each?.type === "CallExpression") {
    const inner =
      ancestors[at - 1]?.type === "MemberExpression" &&
      ancestors[at - 2]?.type === "CallExpression";
    return inner ? [] : dropsIn(read, ancestors, at, node);
  }
  if (each?.type === "JSXElement") {
    const tag = isNode(each.openingElement) ? nameOf(each.openingElement.name) : undefined;
    const children = tag !== undefined && read.names.clientOnly.has(tag);
    return children && !inside(node, each.openingElement) ? ["server"] : [];
  }
  const property = each?.type === "Property" ? each : undefined;
  if (property === undefined || property.kind !== "init" || property.method === true) return [];
  const dropped = property.computed !== true && ROUTE_DROPS.has(keyOf(property.key) ?? "");
  return dropped && read.options.has(ancestors[at - 1] as AstNode) ? ["page"] : [];
}
