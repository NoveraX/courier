import { type AstNode, isNode, nameOf, unparenthesized, walk } from "./ast";
import { courierHeadOf } from "./courier-heads";

/** Whether an HTTP verb reads or writes: the kind it gives the endpoint it addresses. */
export type VerbKind = "query" | "mutation";

const KINDS: ReadonlyMap<string, VerbKind> = new Map([
  ["get", "query"],
  ["head", "query"],
  ["options", "query"],
  ["query", "query"],
  ["post", "mutation"],
  ["put", "mutation"],
  ["patch", "mutation"],
  ["del", "mutation"],
]);
const CLOSURES = new Set(["ArrowFunctionExpression", "FunctionExpression"]);
const FUNCTIONS = new Set([...CLOSURES, "FunctionDeclaration"]);
/* Where an identifier names something other than the wire: x.http, { http: … }. */
const KEYED = new Set(["Property", "TSPropertySignature"]);

/** A method called on an endpoint's chain, and its call. */
export interface ChainMethod {
  readonly name: string;
  readonly call: AstNode;
}

/** A `.via()` on the chain of an HTTP endpoint, and what the chain does after it. */
export interface ViaCall {
  readonly call: AstNode;
  /** What `.via()` is given first: a closure written there, or a name of one. */
  readonly closure: unknown;
  /** The methods called on the endpoint after it, in order. */
  readonly after: readonly ChainMethod[];
  /**
   * Whether the chain goes on past where it is written — held in a
   * `const` the file chains further, or handed to a call — so its kind
   * may be named there.
   */
  readonly goesOn: boolean;
}

/* The values a closure returns: its body, or each return of its own, not of a function inside it; undefined where one returns nothing. */
function returnedValues(closure: AstNode): unknown[] | undefined {
  if (closure.expression === true) return [closure.body];
  if (!isNode(closure.body)) return undefined;
  const values: unknown[] = [];
  let bare = false;
  walk(closure.body, ({ node, ancestors }) => {
    if (node.type !== "ReturnStatement" || ancestors.some((each) => FUNCTIONS.has(each.type)))
      return;
    if (isNode(node.argument)) values.push(node.argument);
    else bare = true;
  });
  return bare ? undefined : values;
}

/* The calls a returned value makes: the value, or each answer of a conditional; undefined where one is no call. */
function callsOf(value: unknown, calls: AstNode[]): AstNode[] | undefined {
  const at = unparenthesized(value);
  if (!isNode(at)) return undefined;
  if (at.type === "ConditionalExpression")
    return callsOf(at.consequent, calls) && callsOf(at.alternate, calls);
  if (at.type !== "CallExpression") return undefined;
  calls.push(at);
  return calls;
}

/**
 * The kinds of the verbs a closure written in place calls on its wire,
 * where its type says them: nothing types the closure or its wire, each
 * value it returns is a verb's call on the wire, and the wire is used for
 * nothing else but its path. Undefined for any other closure.
 *
 * @param closure - What `.via()` is given
 * @returns The kinds, or `undefined`
 * @example
 * ```ts
 * closureKinds(closure); // Set {"query"} for (http, v) => (v.long ? http.query("search", v) : http.get("search", v))
 * ```
 */
export function closureKinds(closure: unknown): ReadonlySet<VerbKind> | undefined {
  if (!isNode(closure) || !CLOSURES.has(closure.type)) return undefined;
  if (closure.async === true || closure.generator === true || isNode(closure.returnType))
    return undefined;
  const [wire] = Array.isArray(closure.params) ? closure.params : [];
  const name = nameOf(wire);
  if (name === undefined || !isNode(wire) || isNode(wire.typeAnnotation)) return undefined;
  const calls: AstNode[] = [];
  for (const value of returnedValues(closure) ?? []) {
    if (callsOf(value, calls) === undefined) return undefined;
  }
  if (calls.length === 0) return undefined;
  const kinds = new Set<VerbKind>();
  const verbs = new Set<unknown>();
  for (const { callee } of calls) {
    if (!isNode(callee) || callee.type !== "MemberExpression" || callee.computed === true)
      return undefined;
    const kind =
      nameOf(callee.object) === name ? KINDS.get(nameOf(callee.property) ?? "") : undefined;
    if (kind === undefined) return undefined;
    kinds.add(kind);
    verbs.add(callee.object);
  }
  let other = false;
  walk(isNode(closure.body) ? closure.body : closure, ({ node, ancestors, key }) => {
    if (other || verbs.has(node) || nameOf(node) !== name) return;
    const parent = ancestors.at(-1);
    const member = parent?.type === "MemberExpression" && parent.computed !== true;
    if (member && key === "object" && nameOf(parent.property) === "path") return;
    if (member && key === "property") return;
    const named =
      parent !== undefined &&
      KEYED.has(parent.type) &&
      key === "key" &&
      parent.computed !== true &&
      parent.shorthand !== true;
    if (!named) other = true;
  });
  return other ? undefined : kinds;
}

/* The methods called on a call's value one after another — reads and response of .via(…).reads().response<User>() — the chain's last call, and what holds it. */
function chainAfter(call: AstNode, ancestors: readonly AstNode[]) {
  const after: ChainMethod[] = [];
  let at = call;
  let index = ancestors.length - 1;
  for (;;) {
    const parent = ancestors[index];
    if (parent?.type === "ParenthesizedExpression") {
      at = parent;
      index -= 1;
      continue;
    }
    const next = ancestors[index - 1];
    const name = parent?.type === "MemberExpression" ? nameOf(parent.property) : undefined;
    if (name === undefined || parent?.object !== at || parent.computed === true) break;
    if (next?.type !== "CallExpression" || next.callee !== parent) break;
    after.push({ name, call: next });
    at = next;
    index -= 2;
  }
  return { after, last: at, holder: ancestors[index] };
}

/**
 * Each `.via()` on the chain of an HTTP endpoint whose head the file
 * takes from `courier()` for certain, with the methods its endpoint is
 * given after it.
 *
 * @param program - The file's tree
 * @returns The calls, in the file's order
 * @example
 * ```ts
 * viaCalls(program).map((via) => via.after.map((method) => method.name)); // [["reads", "response"]]
 * ```
 */
export function viaCalls(program: AstNode): ViaCall[] {
  const chained = new Set<string>();
  const found: Array<Omit<ViaCall, "goesOn"> & ReturnType<typeof chainAfter>> = [];
  walk(program, ({ node, ancestors }) => {
    const object = node.type === "MemberExpression" ? nameOf(node.object) : undefined;
    if (object !== undefined) chained.add(object);
    const { callee } = node;
    if (node.type !== "CallExpression" || !isNode(callee) || callee.type !== "MemberExpression")
      return;
    if (callee.computed === true || nameOf(callee.property) !== "via") return;
    if (courierHeadOf(program, callee.object) !== "endpoint") return;
    const [closure] = Array.isArray(node.arguments) ? node.arguments : [];
    found.push({ call: node, closure, ...chainAfter(node, ancestors) });
  });
  return found.map(({ call, closure, after, last, holder }) => {
    const held = holder?.type === "VariableDeclarator" && holder.init === last;
    const name = held ? nameOf(holder.id) : undefined;
    const handed =
      holder?.type === "CallExpression" &&
      Array.isArray(holder.arguments) &&
      holder.arguments.includes(last);
    return {
      call,
      closure,
      after,
      goesOn: handed || (held && (name === undefined || chained.has(name))),
    };
  });
}
