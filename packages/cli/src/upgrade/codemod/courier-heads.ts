import { type AstNode, isNode, nameOf, unparenthesized, walk } from "./ast";
import { occurrencesOf } from "./identifier-roles";
import { valueImport } from "./imported-calls";

/** A head `courier()` returns, which an endpoint's chain starts from: HTTP, server-sent events or a WebSocket channel. */
export type CourierHead = "endpoint" | "stream" | "channel";

const HEADS: ReadonlySet<string> = new Set<CourierHead>(["endpoint", "stream", "channel"]);
const DEFINE: ReadonlySet<string> = new Set(["@noverax/courier/define"]);

/* What a file binds to what courier() returns: the names of chains that start from a head, by the head, and whether an expression is a value courier() or extend() returned. */
interface Bound {
  readonly chains: ReadonlyMap<string, CourierHead>;
  readonly isBase: (node: unknown) => boolean;
}

/* The head a chain starts from: walked down its calls and members to a head taken from a base, or to a name bound to a chain. */
function startOf(node: unknown, { chains, isBase }: Bound): CourierHead | undefined {
  let at = unparenthesized(node);
  while (isNode(at)) {
    if (at.type === "Identifier") {
      const name = nameOf(at);
      return name === undefined ? undefined : chains.get(name);
    }
    if (at.type === "CallExpression") at = unparenthesized(at.callee);
    else if (at.type === "MemberExpression" && at.computed !== true) {
      const name = nameOf(at.property);
      if (name !== undefined && HEADS.has(name) && isBase(at.object)) return name as CourierHead;
      at = unparenthesized(at.object);
    } else return undefined;
  }
  return undefined;
}

/* Each tree's names bound to courier()'s values, found in one walk the first time a chain of the tree is asked about: a tree is never changed, so it stays true. */
const BOUND = new WeakMap<AstNode, Bound>();

function boundOf(program: AstNode): Bound {
  const known = BOUND.get(program);
  if (known !== undefined) return known;
  const bases = new Set<string>();
  const chains = new Map<string, CourierHead>();
  const once = (name: string) =>
    occurrencesOf(program, name).filter((each) => each.role === "binding").length === 1;
  const courier = valueImport(program, DEFINE, "courier");
  const local = courier !== undefined && once(courier.local) ? courier.local : undefined;
  const isBase = (node: unknown): boolean => {
    const at = unparenthesized(node);
    if (local === undefined || !isNode(at)) return false;
    if (at.type === "Identifier") return bases.has(nameOf(at) ?? "");
    if (at.type !== "CallExpression") return false;
    const callee = unparenthesized(at.callee);
    if (nameOf(callee) === local) return true;
    return (
      isNode(callee) &&
      callee.type === "MemberExpression" &&
      callee.computed !== true &&
      nameOf(callee.property) === "extend" &&
      isBase(callee.object)
    );
  };
  const bound: Bound = { chains, isBase };
  BOUND.set(program, bound);
  if (local === undefined) return bound;
  /* In the file's order, so a name is known by the time a later one is bound from it; only by const, whose value no assignment changes. */
  walk(program, ({ node, ancestors }) => {
    if (node.type !== "VariableDeclarator" || ancestors.at(-1)?.kind !== "const") return;
    const { id, init } = node;
    if (!isNode(id) || !isNode(init)) return;
    const name = nameOf(id);
    if (name !== undefined) {
      if (!once(name)) return;
      if (isBase(init)) bases.add(name);
      const head = startOf(init, bound);
      if (head !== undefined) chains.set(name, head);
      return;
    }
    if (id.type !== "ObjectPattern" || !Array.isArray(id.properties) || !isBase(init)) return;
    for (const property of id.properties.filter(isNode)) {
      const head = property.computed === true ? undefined : nameOf(property.key);
      const named = nameOf(property.value);
      if (head !== undefined && HEADS.has(head) && named !== undefined && once(named))
        chains.set(named, head as CourierHead);
    }
  });
  return bound;
}

/**
 * The head of `courier()` a chain of calls starts from — `endpoint` of
 * `endpoint.get("users").retry({ … })` — where the file says so for
 * certain: a head of what `courier()` from `@noverax/courier/define`, or
 * an `extend()` of it, returned, each name on the way bound once and by
 * `const`.
 *
 * @param program - The file's tree
 * @param node - The chain, or any of it from its start
 * @returns The head, or `undefined` where the chain does not start from one for certain
 * @example
 * ```ts
 * courierHeadOf(program, call.callee); // "endpoint" for const { endpoint } = courier(); endpoint.get("users").retry({ limit: 3 })
 * ```
 */
export function courierHeadOf(program: AstNode, node: unknown): CourierHead | undefined {
  return startOf(node, boundOf(program));
}
