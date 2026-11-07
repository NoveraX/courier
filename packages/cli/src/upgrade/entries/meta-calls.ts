import { parseSync } from "oxc-parser";

import { type AstNode, isNode, nameOf, programOf, walk } from "../codemod/ast";

/** A piece of code, as its calls of `import.meta` are read from it: its text, the extension it parses as, and where oxc's record of its module puts each `import.meta`. */
export interface MetaPiece {
  readonly text: string;
  readonly parseAs: string;
  readonly metas: ReadonlyArray<{ readonly start: number; readonly end: number }>;
}

/** A call of `import.meta`'s that may load code — `import.meta.glob(…)`, `new URL(…, import.meta.url)` — and where it starts in its piece. */
export interface MetaCall {
  readonly node: AstNode;
  readonly at: number;
}

type Span = MetaPiece["metas"][number];

/* An `import.meta` whose member loads modules: a glob, or the file's own address a `new URL()` names a module from. */
const LOADING_META = /^\s*\.\s*(glob|url)\b/;
const NEW_URL = /\bnew\s+URL\s*\(/g;
/* How far a call's text is read, how many closing parentheses are tried for its end, and how many `new URL(` before an `import.meta.url` for its start. */
const CALL_CHARS = 16 * 1024;
const CALL_ENDS = 32;
const URL_STARTS = 4;

/* Whether a node is `import.meta`. */
function isMeta(node: unknown): boolean {
  return (
    isNode(node) &&
    node.type === "MetaProperty" &&
    nameOf(node.meta) === "import" &&
    nameOf(node.property) === "meta"
  );
}

/**
 * A member of `import.meta`, as `import.meta.glob` names it.
 *
 * @param node - The node
 * @returns The member's name, or `undefined` for any other node
 * @example
 * ```ts
 * metaMember(call.callee); // "glob"
 * ```
 */
export function metaMember(node: unknown): string | undefined {
  if (!isNode(node) || node.type !== "MemberExpression" || node.computed === true) return undefined;
  return isMeta(node.object) ? nameOf(node.property) : undefined;
}

/* The base a `new URL()` takes, where it is `import.meta.url`. */
function metaBase(node: AstNode): AstNode | undefined {
  if (node.type !== "NewExpression" || nameOf(node.callee) !== "URL") return undefined;
  const [, base] = Array.isArray(node.arguments) ? node.arguments : [];
  return metaMember(base) === "url" && isNode(base) ? base : undefined;
}

/* The first text from a start up to a closing parenthesis past a point that parses alone, as the piece does: the one expression it is; "other" for more than one statement, or where no parenthesis closes past the point, so no call is open there; none within the limits; "over" once the piece's budget is spent. */
function firstParsed(piece: MetaPiece, start: number, after: number, budget: { left: number }) {
  let end = after;
  for (let tried = 0; tried < CALL_ENDS; tried++) {
    end = piece.text.indexOf(")", end) + 1;
    if (end === 0) return "other";
    if (end - start > CALL_CHARS) return undefined;
    budget.left -= end - start;
    if (budget.left < 0) return "over";
    const parsed = parseSync(`call${piece.parseAs}`, piece.text.slice(start, end));
    if (parsed.errors.length > 0) continue;
    const body = programOf(parsed.program).body;
    const [statement, ...more] = Array.isArray(body) ? body.filter(isNode) : [];
    const expression = statement?.type === "ExpressionStatement" ? statement.expression : undefined;
    return more.length === 0 && isNode(expression) ? expression : "other";
  }
  return undefined;
}

/* Whether what is written before a point may end in a comma, as an argument after another is: the last character past spaces is one or ends a comment, or the spaces cross from a line that holds one. */
function afterComma(text: string, at: number): boolean {
  let end = at;
  while (end > 0 && /\s/.test(text.charAt(end - 1))) end--;
  if (text.charAt(end - 1) === "," || text.charAt(end - 1) === "/") return true;
  const line = text.slice(text.lastIndexOf("\n", end - 1) + 1, end);
  return text.slice(end, at).includes("\n") && line.includes("//");
}

/* The index of the last of the sorted starts before a point. */
function lastBefore(starts: readonly number[], at: number): number {
  let [low, high] = [0, starts.length];
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((starts[middle] ?? 0) < at) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

/* The glob call an `import.meta` starts, from its text: the first up to a closing parenthesis that parses alone is the call, where it is one; "unknown" where none parses within the limits. */
function globAt(piece: MetaPiece, meta: Span, budget: { left: number }) {
  const parsed = firstParsed(piece, meta.start, meta.end, budget);
  if (parsed === undefined || parsed === "over") return "unknown";
  const call = isNode(parsed) && parsed.type === "ChainExpression" ? parsed.expression : parsed;
  const glob = isNode(call) && call.type === "CallExpression" && metaMember(call.callee) === "glob";
  return glob ? { node: call, at: meta.start } : undefined;
}

/* The `new URL()` an `import.meta.url` is the base of, from its text: each `new URL(` before it, the nearest first, is told by its first text past it that parses alone — that call, one the base is inside of but not the base of, or another start's; "unknown" where none tells within the limits. */
function urlAt(piece: MetaPiece, meta: Span, starts: readonly number[], budget: { left: number }) {
  if (!afterComma(piece.text, meta.start)) return undefined;
  let untold = false;
  for (let index = lastBefore(starts, meta.start), tried = 0; index >= 0; index--, tried++) {
    const start = starts[index] ?? 0;
    if (tried === URL_STARTS || meta.start - start > CALL_CHARS) return "unknown";
    const parsed = firstParsed(piece, start, meta.end, budget);
    if (parsed === "over") return "unknown";
    untold ||= parsed === undefined;
    if (!isNode(parsed) || parsed.type !== "NewExpression" || nameOf(parsed.callee) !== "URL")
      continue;
    if (metaBase(parsed)?.start === meta.start - start) return { node: parsed, at: start };
    return untold ? "unknown" : undefined;
  }
  return untold ? "unknown" : undefined;
}

/**
 * Each call of a piece's `import.meta` that may load code —
 * `import.meta.glob(…)`, and `new URL()` with `import.meta.url` for its
 * base — each parsed from its own text alone, from where oxc's record of
 * the module puts its `import.meta`, as Vite reads a glob's call: the
 * piece's whole tree, which costs more the larger the piece is, is not
 * asked for. Where a call's text is not told within the limits, none is
 * given, and the caller reads the piece's tree for them.
 *
 * @param piece - The piece's text, the extension it parses as, and its `import.meta`
 * @returns The calls, each with its node from its own text; none where the tree is to be read
 * @example
 * ```ts
 * metaCalls({ text, parseAs: ".ts", metas: parsed.module.importMetas })?.[0]?.node.type; // "CallExpression"
 * ```
 */
export function metaCalls(piece: MetaPiece): readonly MetaCall[] | undefined {
  const calls: MetaCall[] = [];
  /* At most one more parse of the piece is spent on its calls, before its tree is read. */
  const budget = { left: piece.text.length + CALL_CHARS };
  let starts: number[] | undefined;
  for (const meta of piece.metas) {
    const member = LOADING_META.exec(piece.text.slice(meta.end, meta.end + 64))?.[1];
    if (member === undefined) continue;
    starts ??= [...piece.text.matchAll(NEW_URL)].map((match) => match.index);
    const call =
      member === "glob" ? globAt(piece, meta, budget) : urlAt(piece, meta, starts, budget);
    if (call === "unknown") return undefined;
    if (call !== undefined) calls.push(call);
  }
  return calls;
}

/**
 * Each call of `import.meta`'s that may load code in a piece's whole
 * tree, where they are not told from their own texts.
 *
 * @param program - The piece's tree
 * @returns The calls
 * @example
 * ```ts
 * callsIn(programOf(parsed.program)).length; // 2
 * ```
 */
export function callsIn(program: AstNode): MetaCall[] {
  const calls: MetaCall[] = [];
  walk(program, ({ node }) => {
    const glob = node.type === "CallExpression" && metaMember(node.callee) === "glob";
    if (glob || metaBase(node) !== undefined) calls.push({ node, at: node.start });
  });
  return calls;
}
