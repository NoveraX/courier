import { type AstNode, isNode, nameOf, type Visited, walk } from "../codemod/ast";
import { occurrencesOf } from "../codemod/identifier-roles";
import { boundOnce, droppedImport, textOf, valueImport } from "../codemod/imported-calls";
import { namedImports } from "../codemod/imports";
import { addedToDeclaration } from "../codemod/specifier-lists";
import { CORE_MODULES } from "../entries/entry-names";
import type { Migration, SourceFile, TextEdit } from "../migration";

/* Places a `||` stands in without brackets: a condition, a value given or returned whole, another `||`. */
const BARE = new Set([
  "IfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "ReturnStatement",
  "VariableDeclarator",
  "ExpressionStatement",
  "ParenthesizedExpression",
  "ArrayExpression",
  "Property",
]);

function isZero(node: unknown): boolean {
  return isNode(node) && node.type === "Literal" && node.value === 0;
}

/* `x.status`, of the value the check was given. */
function isStatusOf(file: SourceFile, node: unknown, value: string): boolean {
  return (
    isNode(node) &&
    node.type === "MemberExpression" &&
    node.computed !== true &&
    nameOf(node.property) === "status" &&
    textOf(file, node.object) === value
  );
}

/* `isHTTPError(x)`, of the file's import: the value it is given. */
function checkedBy(file: SourceFile, node: unknown, local: string): string | undefined {
  if (!isNode(node) || node.type !== "CallExpression" || nameOf(node.callee) !== local)
    return undefined;
  const args = Array.isArray(node.arguments) ? node.arguments : [];
  const value = args.length === 1 ? textOf(file, args[0]) : "";
  return value === "" ? undefined : value;
}

/* `x.status === 0`, either way round. */
function isStatusZero(file: SourceFile, node: AstNode, value: string): boolean {
  if (node.type !== "BinaryExpression" || (node.operator !== "===" && node.operator !== "=="))
    return false;
  return (
    (isStatusOf(file, node.left, value) && isZero(node.right)) ||
    (isZero(node.left) && isStatusOf(file, node.right, value))
  );
}

/*
 * Where a node checks `isHTTPError(x) && x.status === 0`: the value, and
 * where the check starts — the node itself, or, at the end of a longer
 * `&&` chain, the call, the check then standing in brackets.
 */
function checkAt(file: SourceFile, node: AstNode, local: string) {
  const { left, right } = node;
  if (
    node.type !== "LogicalExpression" ||
    node.operator !== "&&" ||
    !isNode(left) ||
    !isNode(right)
  )
    return undefined;
  const direct = checkedBy(file, left, local);
  if (direct !== undefined && isStatusZero(file, right, direct))
    return { value: direct, start: node.start, inChain: false };
  if (left.type !== "LogicalExpression" || left.operator !== "&&" || !isNode(left.right))
    return undefined;
  const chained = checkedBy(file, left.right, local);
  if (chained === undefined || !isStatusZero(file, right, chained)) return undefined;
  return { value: chained, start: left.right.start, inChain: true };
}

function bare({ ancestors, key }: Visited): boolean {
  const parent = ancestors.at(-1);
  if (parent === undefined) return true;
  if (parent.type === "LogicalExpression") return parent.operator === "||";
  if (parent.type === "ConditionalExpression") return key === "test";
  if (parent.type === "ArrowFunctionExpression") return key === "body";
  if (parent.type === "CallExpression" || parent.type === "NewExpression")
    return key === "arguments";
  return BARE.has(parent.type);
}

/* The import's changes: the two names in isHTTPError's place where every use was such a check, beside it otherwise. */
function importEdits(
  file: SourceFile,
  named: NonNullable<ReturnType<typeof valueImport>>,
  checks: number,
): TextEdit[] {
  const have = new Set(
    namedImports(file.program, new Set([named.module])).map((each) => each.imported),
  );
  const names = ["isNetworkError", "isTimeoutError"].filter((name) => !have.has(name));
  const left = occurrencesOf(file.program, named.local).filter(
    (each) => each.role === "reference",
  ).length;
  if (left === checks && names.length > 0)
    return [{ start: named.specifier.start, end: named.specifier.end, text: names.join(", ") }];
  if (left === checks) return droppedImport(file, named);
  const add = names.map((spec) => ({ spec, typeOnly: false }));
  const added =
    add.length > 0 ? addedToDeclaration(file, "import", named.module, add, new Set()) : undefined;
  return added === undefined ? [] : [added];
}

/**
 * 0.5.0: a request that got no answer rejects with a `NetworkError`, and
 * one whose time ran out with a `TimeoutError`, no longer with an
 * `HTTPError` of status 0. `isHTTPError(error) && error.status === 0`
 * reads `isNetworkError(error) || isTimeoutError(error)`, and the file
 * imports the two where it imports `isHTTPError` from: the core's root,
 * or one of its entries.
 */
export const HTTP_ERROR_STATUS_ZERO: Migration = {
  id: "0.5.0/http-error-status-zero",
  title: "tells a request that got no answer by isNetworkError() and isTimeoutError()",
  mentions: ["isHTTPError"],
  migrate(file) {
    const named = valueImport(file.program, CORE_MODULES, "isHTTPError");
    if (named === undefined) return { edits: [], findings: [], packages: [] };
    const edits: TextEdit[] = [];
    walk(file.program, (visited) => {
      const at = checkAt(file, visited.node, named.local);
      if (at === undefined) return;
      const check = `isNetworkError(${at.value}) || isTimeoutError(${at.value})`;
      const text = !at.inChain && bare(visited) ? check : `(${check})`;
      edits.push({ start: at.start, end: visited.node.end, text });
    });
    /* The checks are the import's for certain only where the file binds its name nowhere else. */
    if (edits.length === 0 || !boundOnce(file.program, named))
      return { edits: [], findings: [], packages: [] };
    return {
      edits: [...edits, ...importEdits(file, named, edits.length)],
      findings: [],
      packages: [],
    };
  },
};
