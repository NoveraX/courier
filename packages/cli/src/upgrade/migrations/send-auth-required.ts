import { isNode } from "../codemod/ast";
import { occurrencesOf } from "../codemod/identifier-roles";
import {
  boundImport,
  callsOf,
  droppedImport,
  inAsyncFunction,
  textOf,
} from "../codemod/imported-calls";
import type { Finding, Migration, TextEdit } from "../migration";

const ROOT = new Set(["@noverax/courier"]);
const SIMPLE = new Set(["Identifier", "MemberExpression", "ThisExpression", "CallExpression"]);

/**
 * 0.5.0: `sendAuthRequired(connections, id, ms)` is gone for
 * `connections.requireAuth(id, { timeoutMs: ms })`, which asks the
 * connection on every replica and returns a promise. A call whose value
 * goes unused, in an async function, is rewritten with `await`; any other
 * is left to the person with its replacement written out.
 */
export const SEND_AUTH_REQUIRED: Migration = {
  id: "0.5.0/send-auth-required",
  title: "asks for credentials again with connections.requireAuth()",
  mentions: ["sendAuthRequired"],
  migrate(file) {
    const named = boundImport(file.program, ROOT, "sendAuthRequired");
    if (named === undefined) return { edits: [], findings: [], packages: [] };
    const edits: TextEdit[] = [];
    const findings: Finding[] = [];
    const calls = callsOf(file.program, named.local);
    for (const { node, ancestors } of calls) {
      const [registry, id, ms] = Array.isArray(node.arguments) ? node.arguments.filter(isNode) : [];
      if (registry === undefined || id === undefined) continue;
      const on = SIMPLE.has(registry.type) ? textOf(file, registry) : `(${textOf(file, registry)})`;
      const options = ms === undefined ? "" : `, { timeoutMs: ${textOf(file, ms)} }`;
      const call = `${on}.requireAuth(${textOf(file, id)}${options})`;
      const statement = ancestors.at(-1)?.type === "ExpressionStatement";
      if (statement && inAsyncFunction(ancestors))
        edits.push({ start: node.start, end: node.end, text: `await ${call}` });
      else
        findings.push({
          at: node.start,
          what: "sendAuthRequired() is gone: connections.requireAuth() returns a promise, which an async function awaits",
          instead: [`await ${call}`],
        });
    }
    /* The import goes once every reference to it was a call rewritten. */
    const references = occurrencesOf(file.program, named.local).filter(
      (each) => each.role === "reference",
    );
    if (edits.length > 0 && edits.length === references.length)
      edits.push(...droppedImport(file, named));
    return { edits, findings, packages: [] };
  },
};
