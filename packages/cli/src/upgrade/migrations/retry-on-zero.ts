import { type AstNode, isNode, nameOf, walk } from "../codemod/ast";
import { isCourierMethod, quoteOf } from "../codemod/courier-chains";
import { boundImport } from "../codemod/imported-calls";
import type { Finding, Migration, TextEdit } from "../migration";

const MIDDLEWARE = new Set(["@noverax/courier", "@noverax/courier/middleware"]);

/*
 * The edits that write a list's 0 as the failures it stood for: the
 * first 0 becomes the kinds the list does not name yet, and any other 0,
 * or the first where it names both, goes with its comma.
 */
function zeroEdits(elements: readonly AstNode[], quote: string): TextEdit[] {
  const named = new Set(elements.map((each) => each.value));
  const kinds = ["network", "timeout"].filter((kind) => !named.has(kind));
  const edits: TextEdit[] = [];
  elements.forEach((element, at) => {
    if (element.type !== "Literal" || element.value !== 0) return;
    const written = kinds.splice(0).map((kind) => `${quote}${kind}${quote}`);
    if (written.length > 0) {
      edits.push({ start: element.start, end: element.end, text: written.join(", ") });
      return;
    }
    const previous = elements[at - 1];
    const next = elements[at + 1];
    if (previous !== undefined) edits.push({ start: previous.end, end: element.end, text: "" });
    else if (next !== undefined) edits.push({ start: element.start, end: next.start, text: "" });
  });
  return edits;
}
const AS_FUNCTION = new Set(["ArrowFunctionExpression", "FunctionExpression"]);

/**
 * 0.5.0: a request that got no answer is a `NetworkError` or a
 * `TimeoutError`, no longer status 0, so a retry policy that listed 0
 * names `"network"` and `"timeout"` in its place. A `retryOn` written as
 * a function receives a `RetryFailure` now, and is left to the person.
 */
export const RETRY_ON_ZERO: Migration = {
  id: "0.5.0/retry-on-zero",
  title: "retries a request that got no answer as network and timeout",
  mentions: ["retryOn"],
  migrate(file) {
    const middleware = boundImport(file.program, MIDDLEWARE, "retryMiddleware");
    const quote = quoteOf(file.program, file.text);
    const edits: TextEdit[] = [];
    const findings: Finding[] = [];
    walk(file.program, ({ node, ancestors }) => {
      const call = ancestors.at(-2);
      if (node.type !== "Property" || node.computed === true || nameOf(node.key) !== "retryOn")
        return;
      if (ancestors.at(-1)?.type !== "ObjectExpression" || call?.type !== "CallExpression") return;
      const courier =
        (middleware !== undefined && nameOf(call.callee) === middleware.local) ||
        isCourierMethod(file.program, call, "retry");
      const { value } = node;
      if (!courier || !isNode(value)) return;
      if (AS_FUNCTION.has(value.type)) {
        findings.push({
          at: node.start,
          what: "a retryOn function receives a RetryFailure now, whose kind names the failure",
          instead: ['retryOn: (failure) => failure.kind === "status" && failure.status === 503'],
        });
        return;
      }
      if (value.type !== "ArrayExpression" || !Array.isArray(value.elements)) return;
      edits.push(...zeroEdits(value.elements.filter(isNode), quote));
    });
    return { edits, findings, packages: [] };
  },
};
