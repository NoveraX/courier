import { isNode, nameOf, walk } from "../codemod/ast";
import { boundImport } from "../codemod/imported-calls";
import type { Finding, Migration } from "../migration";

const CONFIG = new Set(["@noverax/courier/config"]);
const PIN_REFUSED =
  "Studio hashes a specification that holds a file's bytes anew, so it refuses a pin of one with 409 SPEC_PIN_MISMATCH: import the specification again, then pin the hash the error names";

/* A key's name, as an identifier or as a string. */
function keyOf(key: unknown): string | undefined {
  if (isNode(key) && key.type === "Literal" && typeof key.value === "string") return key.value;
  return nameOf(key);
}

/**
 * 0.5.0: Studio's parser marks a string that holds a file's bytes, so the
 * hash it keeps of a specification that holds one is new, and a URL
 * import pinned to the old hash is refused. Each `pinHash` of the config
 * is found; it is left as written, as only the specification parsed
 * again gives the new hash.
 */
export const PIN_HASH: Migration = {
  id: "0.5.0/pin-hash",
  title: "finds an import's pinHash, which Studio may hash anew",
  mentions: ["pinHash"],
  migrate(file) {
    const findings: Finding[] = [];
    const define = boundImport(file.program, CONFIG, "defineConfig");
    if (define === undefined) return { edits: [], findings, packages: [] };
    walk(file.program, ({ node, ancestors }) => {
      if (node.type !== "Property" || node.computed === true || keyOf(node.key) !== "pinHash")
        return;
      const configured = ancestors.some(
        (each) => each.type === "CallExpression" && nameOf(each.callee) === define.local,
      );
      if (configured) findings.push({ at: node.start, what: PIN_REFUSED, instead: [] });
    });
    return { edits: [], findings, packages: [] };
  },
};
