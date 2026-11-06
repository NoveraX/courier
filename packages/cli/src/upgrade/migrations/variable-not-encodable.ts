import { isRecord } from "../../util/is-record";
import { type AstNode, isNode, nameOf, walk } from "../codemod/ast";
import { textOf } from "../codemod/imported-calls";
import type { Finding, Migration, TextEdit } from "../migration";

const OLD = "PROXY_VARIABLE_NOT_SERIALIZABLE";
const NEW = "VARIABLE_NOT_ENCODABLE";
/* Nodes whose key names a field, which code elsewhere may read by the same name. */
const KEYED = new Set([
  "Property",
  "PropertyDefinition",
  "MethodDefinition",
  "AccessorProperty",
  "TSPropertySignature",
  "TSMethodSignature",
  "TSAbstractPropertyDefinition",
  "TSAbstractMethodDefinition",
]);
const RENAME_FIELD = `${OLD} is ${NEW} now, from a direct call and a proxy call alike: a field named for it is renamed with every read of it`;

/* The text of a string, or of a template with nothing put in it. */
function stringOf(node: AstNode): string | undefined {
  if (node.type === "Literal") return typeof node.value === "string" ? node.value : undefined;
  if (node.type !== "TemplateLiteral" || !Array.isArray(node.quasis)) return undefined;
  if (!Array.isArray(node.expressions) || node.expressions.length > 0) return undefined;
  const [quasi] = node.quasis;
  const cooked = isNode(quasi) && isRecord(quasi.value) ? quasi.value.cooked : undefined;
  return typeof cooked === "string" ? cooked : undefined;
}

/* Whether a node names a field where it is: a key, a member read by it, an enum's member. */
function namesField(parent: AstNode | undefined, key: string): boolean {
  if (parent === undefined) return false;
  if (KEYED.has(parent.type)) return key === "key";
  if (parent.type === "MemberExpression") return key === "property";
  return parent.type === "TSEnumMember" && key === "id";
}

/**
 * 0.5.0: a value no form of the request carries is refused with
 * `VARIABLE_NOT_ENCODABLE`, from a direct call and from a proxy call
 * alike; 0.4's `PROXY_VARIABLE_NOT_SERIALIZABLE` is gone. Each string
 * that names the old code names the new one. A field named for it — a
 * key, a member read by it — is found and left to the person, as code
 * elsewhere may read it by that name.
 */
export const VARIABLE_NOT_ENCODABLE: Migration = {
  id: "0.5.0/variable-not-encodable",
  title: `names ${NEW} where the code was ${OLD}`,
  mentions: [OLD],
  migrate(file) {
    const edits: TextEdit[] = [];
    const findings: Finding[] = [];
    walk(file.program, ({ node, ancestors, key }) => {
      const parent = ancestors.at(-1);
      const field = namesField(parent, key);
      if (stringOf(node) !== OLD && !(field && nameOf(node) === OLD)) return;
      if (field) {
        const written = textOf(file, parent).replace(OLD, NEW);
        findings.push({
          at: node.start,
          what: RENAME_FIELD,
          instead: [written.includes("\n") ? NEW : written],
        });
        return;
      }
      if (parent?.type === "TaggedTemplateExpression") return;
      const quote = node.type === "TemplateLiteral" ? "`" : textOf(file, node).charAt(0);
      edits.push({ start: node.start, end: node.end, text: `${quote}${NEW}${quote}` });
    });
    return { edits, findings, packages: [] };
  },
};
