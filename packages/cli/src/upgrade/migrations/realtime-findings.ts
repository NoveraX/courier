import { type AstNode, isNode, nameOf, walk } from "../codemod/ast";
import { textOf } from "../codemod/imported-calls";
import type { Finding, Migration, SourceFile } from "../migration";

const FUNCTIONS = new Set(["ArrowFunctionExpression", "FunctionExpression"]);

/* A registry's call as 0.4 made it, by the method and what it was given, and what 0.5 writes in its place. */
function registryCall(file: SourceFile, node: AstNode): Finding | undefined {
  const { callee } = node;
  if (!isNode(callee) || callee.type !== "MemberExpression") return undefined;
  const method = nameOf(callee.property);
  const on = textOf(file, callee.object);
  const args = Array.isArray(node.arguments) ? node.arguments.filter(isNode) : [];
  const [first, second, third] = args.map((each) => textOf(file, each));
  const isFunction = args[0] !== undefined && FUNCTIONS.has(args[0].type);
  const options = (code: string | undefined, reason: string | undefined) =>
    `{ ${[code && `code: ${code}`, reason && `reason: ${reason}`].filter(Boolean).join(", ")} }`;
  const at = node.start;
  if (/sseConnections$/i.test(on)) {
    if (method === "disconnect" && args.length === 2)
      return {
        at,
        what: "an SSE stream's disconnect() takes no reason, and returns a promise",
        instead: [`await ${on}.disconnect(${first})`],
      };
    if (method === "disconnectAll" && args.length === 1)
      return { at, what: "disconnectAll() takes no reason", instead: [`${on}.disconnectAll()`] };
    if (method === "getByMeta")
      return {
        at,
        what: "getByMeta() is gone for a selector",
        instead: [`${on}.list({ meta: { /* the fields to match */ } })`],
      };
    if (method === "broadcastToMeta" && isFunction)
      return {
        at,
        what: "broadcastToMeta() takes the fields to match, not a function",
        instead: [`${on}.broadcastToMeta({ /* the fields to match */ }, ${second})`],
      };
    return undefined;
  }
  if (!/connections$/i.test(on)) return undefined;
  if (method === "disconnect" && args.length >= 2)
    return {
      at,
      what: "disconnect() takes its code and reason as options, and returns a promise",
      instead: [`await ${on}.disconnect(${first}, ${options(second, third)})`],
    };
  if (method === "disconnectByMeta")
    return {
      at,
      what: "disconnectByMeta() is gone for a selector",
      instead: [
        `await ${on}.disconnect({ meta: { /* the fields to match */ } }, ${options(second, third)})`,
      ],
    };
  if (method === "getByMeta")
    return {
      at,
      what: "getByMeta() is gone for a selector",
      instead: [
        `${on}.list({ meta: { /* the fields to match */ } })`,
        `${on}.list().filter((connection) => (${first})(connection.meta))`,
      ],
    };
  return undefined;
}

/* The entries of a list of hosts that write more than a host: a scheme, a path, a user. */
function hostsWithMore(list: unknown): string[] {
  if (!isNode(list) || list.type !== "ArrayExpression" || !Array.isArray(list.elements)) return [];
  return list.elements
    .filter(isNode)
    .map((each) => each.value)
    .filter((value): value is string => typeof value === "string" && /:\/\/|\/|@/.test(value));
}

/* An option of 0.4's client a property names, and what holds now. */
function clientOption(
  node: AstNode,
  parent: AstNode | undefined,
  grand: AstNode | undefined,
): Finding | undefined {
  const name = nameOf(node.key);
  const inWs =
    grand?.type === "Property" && nameOf(grand.key) === "ws" && parent?.type === "ObjectExpression";
  if (inWs && (name === "heartbeat" || name === "maxMessageSize"))
    return {
      at: node.start,
      what: `the client's ws.${name} is gone: the server names it in auth_ok`,
      instead: ["createWSHandler({ heartbeatIntervalMs, heartbeatTimeoutMs, maxMessageSize })"],
    };
  if (name === "allowedHosts" && hostsWithMore(node.value).length > 0)
    return {
      at: node.start,
      what: "an allowedHosts entry with a scheme, a path or a user is refused, where it matched nothing",
      instead: ['allowedHosts: ["example.com"]'],
    };
  return undefined;
}

/**
 * 0.5.0: what code wrote for 0.4's realtime that a codemod cannot change
 * for certain — whose registry a call is on, what a predicate matches —
 * each found and left to the person with what to write instead: a
 * registry's selectors and promises, the client's options the server
 * names now, a pub/sub adapter of one's own, and a host entry that never
 * matched.
 */
export const REALTIME_FINDINGS: Migration = {
  id: "0.5.0/realtime-findings",
  title: "finds the realtime calls of 0.4 the code makes",
  mentions: [
    "disconnect",
    "ByMeta",
    "heartbeat",
    "maxMessageSize",
    "allowedHosts",
    "PubSubAdapter",
  ],
  migrate(file) {
    const findings: Finding[] = [];
    walk(file.program, ({ node, ancestors }) => {
      if (node.type === "CallExpression") {
        const found = registryCall(file, node);
        if (found !== undefined) findings.push(found);
      }
      if (node.type === "Property" && node.computed !== true) {
        const found = clientOption(node, ancestors.at(-1), ancestors.at(-2));
        if (found !== undefined) findings.push(found);
      }
      if (node.type === "TSClassImplements" && /\bPubSubAdapter\b/.test(textOf(file, node)))
        findings.push({
          at: node.start,
          what: "a pub/sub adapter of your own implements state, onStateChange() and stats(), and queues while not ready",
          instead: [],
        });
    });
    return { edits: [], findings, packages: [] };
  },
};
