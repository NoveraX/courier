import { type AstNode, isNode, nameOf, walk } from "../codemod/ast";
import { boundOnce, textOf, valueImport } from "../codemod/imported-calls";
import type { Finding, Migration } from "../migration";

const ROOT = new Set(["@noverax/courier"]);

/* `x.a.b`, of a member chain written plainly: the names, `x` first. */
function memberPath(node: unknown): string[] | undefined {
  if (!isNode(node)) return undefined;
  if (node.type === "Identifier") return [String(node.name)];
  if (node.type !== "MemberExpression" || node.computed === true) return undefined;
  const object = memberPath(node.object);
  const property = nameOf(node.property);
  return object === undefined || property === undefined ? undefined : [...object, property];
}

/* The sides of `a === b` or `a == b`, either way round. */
function equalSides(node: AstNode): [AstNode, AstNode][] {
  if (node.type !== "BinaryExpression" || (node.operator !== "===" && node.operator !== "=="))
    return [];
  const { left, right } = node;
  return isNode(left) && isNode(right)
    ? [
        [left, right],
        [right, left],
      ]
    : [];
}

function literalOf(node: AstNode): unknown {
  return node.type === "Literal" ? node.value : undefined;
}

/* What a comparison of 0.4's call errors reads, and what to write instead. */
function comparison(node: AstNode): Finding | undefined {
  for (const [member, other] of equalSides(node)) {
    const path = memberPath(member);
    const value = literalOf(other);
    if (path === undefined) continue;
    const owner = path.slice(0, -1).join(".");
    if (path.at(-1) === "status" && value === 499)
      return {
        at: node.start,
        what: "a call a newer one superseded rejects with an AbortError of code SUPERSEDED, not status 499",
        instead: [`isAbortError(${owner}) && ${owner}.code === "SUPERSEDED"`],
      };
    if (path.slice(-2).join(".") === "data.code" && value === "TIMEOUT")
      return {
        at: node.start,
        what: "a call whose time ran out rejects with a TimeoutError",
        instead: [`isTimeoutError(${path.slice(0, -2).join(".")})`],
      };
    if (
      path.slice(-2).join(".") === "data.code" &&
      typeof value === "string" &&
      /^E[A-Z]+$/.test(value)
    )
      return {
        at: node.start,
        what: "a NetworkError names the system's code in systemCode",
        instead: [`${path.slice(0, -2).join(".")}.systemCode === "${value}"`],
      };
  }
  return undefined;
}

/**
 * 0.5.0: the checks code wrote for 0.4's call errors, which a codemod
 * cannot change for certain — a body's own `code` may be `"TIMEOUT"` too,
 * an upstream may answer 499 — each found and left to the person with
 * what to write instead: a timeout by `isTimeoutError()`, a superseded
 * call by `AbortError` `SUPERSEDED`, the system's code by `systemCode`,
 * a mock's `HTTPError` of status 0 as a `NetworkError`, a platform's
 * abort by `isAbortError()`, and `onError` given a `RequestFailure`.
 */
export const CALL_ERROR_FINDINGS: Migration = {
  id: "0.5.0/call-error-findings",
  title: "finds the call errors of 0.4 the code checks",
  mentions: ["status", "code", "HTTPError", "DOMException"],
  migrate(file) {
    const findings: Finding[] = [];
    const httpError = valueImport(file.program, ROOT, "HTTPError");
    /* Whether the file's HTTPError is the import, for certain: asked only where a check names it. */
    let bound: boolean | undefined;
    const isBound = () => {
      bound ??= httpError !== undefined && boundOnce(file.program, httpError);
      return bound;
    };
    walk(file.program, ({ node }) => {
      const found = comparison(node);
      if (found !== undefined) findings.push(found);
      if (
        node.type === "NewExpression" &&
        httpError !== undefined &&
        nameOf(node.callee) === httpError.local &&
        isBound()
      ) {
        const text = textOf(file, node);
        if (/\bstatus\s*:\s*0\b/.test(text))
          findings.push({
            at: node.start,
            what: "new HTTPError() refuses status 0: a request that got no answer is a NetworkError",
            instead: ["new NetworkError({ cause })"],
          });
      }
      if (
        node.type === "LogicalExpression" &&
        /instanceof DOMException/.test(textOf(file, node.left)) &&
        /\.name\s*===?\s*["']AbortError["']/.test(textOf(file, node.right))
      )
        findings.push({
          at: node.start,
          what: "a cancelled call rejects with Courier's AbortError, its signal's reason its cause",
          instead: [
            `isAbortError(${textOf(file, node.left).replace(/\s*instanceof DOMException$/, "")})`,
          ],
        });
      if (
        node.type === "Property" &&
        nameOf(node.key) === "onError" &&
        /:\s*HTTPError\b/.test(textOf(file, node.value)) &&
        isBound()
      )
        findings.push({
          at: node.start,
          what: "onError receives a RequestFailure: an HTTPError, a NetworkError or a TimeoutError",
          instead: [textOf(file, node).replace(/:\s*HTTPError\b/, ": RequestFailure")],
        });
    });
    return { edits: [], findings, packages: [] };
  },
};
