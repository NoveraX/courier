import { type CallExpression, parseSync, type VariableDeclarator, Visitor } from "oxc-parser";

import { chainOf, literalString } from "./call-chain";
import { scriptBlocks } from "./script-blocks";

/** A call in the code that may reach an endpoint, before it is matched with one. */
export interface CodeCall {
  /** What it is made on, then the names it is made through, the endpoint's name last: `["storefront", "live", "orders"]` */
  readonly names: readonly string[];
  /** Where the endpoint's name is written in the file */
  readonly start: number;
  readonly end: number;
  /** The call is made on a caller this file creates */
  readonly onCaller: boolean;
  /** What that caller's creation names its source by: `createCaller(shop)`, or `createProxyCaller(shopRoutes)` */
  readonly callerSource?: string | undefined;
}

interface FoundCall {
  readonly names: readonly string[];
  readonly start: number;
  readonly end: number;
  readonly root: string | undefined;
}

/* A query caller's hooks name the endpoint as their first argument: `q.users.useQuery("getAll")`. */
const HOOKS: ReadonlySet<string> = new Set([
  "useQuery",
  "useSuspenseQuery",
  "useInfiniteQuery",
  "useMutation",
  "useSubscription",
  "useComputedQuery",
  "useChannel",
  "prefetchQuery",
  "queryKey",
]);

const CALLER_FACTORY = /^create\w*Caller$/;

/**
 * The calls in a file that may reach an endpoint: each member chain called —
 * `api.users.list()` — and each query hook that names an endpoint —
 * `q.users.useQuery("list")` — with where the endpoint's name is written
 * and, when the call is made on a caller the file creates, that caller's
 * source. A file that does not parse has none.
 *
 * @param fileName - The file's name, which says how to read it
 * @param text - Its text
 * @returns The calls, in the order written
 * @example
 * ```ts
 * codeCalls("cart.ts", 'await api.cart.add({ sku: "A" })')[0]?.names; // ["api", "cart", "add"]
 * ```
 */
export function codeCalls(fileName: string, text: string): CodeCall[] {
  return scriptBlocks(fileName, text).flatMap((block) =>
    callsIn(block.fileName, block.code).map((call) => ({
      ...call,
      start: call.start + block.offset,
      end: call.end + block.offset,
    })),
  );
}

function callsIn(fileName: string, code: string): CodeCall[] {
  const { program, errors } = parseSync(fileName, code);
  if (errors.length > 0 && program.body.length === 0) return [];
  const callers = new Map<string, string | undefined>();
  const found: FoundCall[] = [];
  new Visitor({
    VariableDeclarator(node) {
      const caller = callerCreated(node);
      if (caller) callers.set(caller.name, caller.source);
    },
    CallExpression(node) {
      const call = foundCall(node);
      if (call) found.push(call);
    },
  }).visit(program);
  return found.map(({ root, ...call }) =>
    root !== undefined && callers.has(root)
      ? { ...call, onCaller: true, callerSource: callers.get(root) }
      : { ...call, onCaller: false },
  );
}

/* `const api = createProxyCaller(shopRoutes, …)`: the variable, and what it names its source by. */
function callerCreated(node: VariableDeclarator): { name: string; source?: string } | undefined {
  const init = node.init;
  if (node.id.type !== "Identifier" || init?.type !== "CallExpression") return undefined;
  if (init.callee.type !== "Identifier" || !CALLER_FACTORY.test(init.callee.name)) return undefined;
  const [first] = init.arguments;
  const source = first?.type === "Identifier" ? first.name : undefined;
  return source === undefined ? { name: node.id.name } : { name: node.id.name, source };
}

function foundCall(node: CallExpression): FoundCall | undefined {
  const chain = chainOf(node.callee);
  if (!chain) return undefined;
  const last = chain.names.length - 1;
  /* What the chain is made on leads its names — an empty name for anything but a variable — so an endpoint's names are never all of them. */
  const lead = [chain.root ?? ""];
  const argument = node.arguments[0];
  const hooked = HOOKS.has(chain.names[last] ?? "") ? literalString(argument) : undefined;
  if (hooked !== undefined && argument !== undefined) {
    const names = [...lead, ...chain.names.slice(0, last), hooked];
    return { names, start: argument.start, end: argument.end, root: chain.root };
  }
  const [start, end] = chain.spans[last] ?? [node.start, node.end];
  return { names: [...lead, ...chain.names], start, end, root: chain.root };
}
