import { isNode, nameOf, walk } from "../codemod/ast";
import type { Finding, Migration } from "../migration";

/**
 * 0.4.0: `cancelPrevious` is `true` or `false`, on a call's `.with()`, an
 * endpoint's `.cancelPrevious()`, a group, a client or the API; a list of
 * the paths it cancelled is refused. Each list is found and left to the
 * person, who marks the reads it named.
 */
export const CANCEL_PREVIOUS_LIST: Migration = {
  id: "0.4.0/cancel-previous-list",
  title: "finds cancelPrevious given as a list",
  migrate(file) {
    const findings: Finding[] = [];
    walk(file.program, ({ node }) => {
      if (
        node.type !== "Property" ||
        node.computed === true ||
        nameOf(node.key) !== "cancelPrevious"
      )
        return;
      if (!isNode(node.value) || node.value.type !== "ArrayExpression") return;
      findings.push({
        at: node.start,
        what: "cancelPrevious is true or false: mark each read it named with .cancelPrevious(), and leave the list out",
        instead: ['search: endpoint.get("search").variables<{ q: string }>().cancelPrevious(),'],
      });
    });
    return { edits: [], findings, packages: [] };
  },
};
