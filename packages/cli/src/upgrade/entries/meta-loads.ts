import { isRecord } from "../../util/is-record";
import { type AstNode, isNode, nameOf } from "../codemod/ast";
import { callsIn, type MetaPiece, metaCalls } from "./meta-calls";

/** A glob `import.meta.glob` loads modules by, as its call writes it. */
export interface GlobLoad {
  /** The patterns, each a path from the file, from the package's root or by an alias; one that leaves files out starts with `!`. */
  readonly patterns: readonly string[];
  /** The folder its relative patterns are read from, where the call names one: `base`. */
  readonly base: string | undefined;
  /** Whether case is read as the same: `caseSensitive: false`. */
  readonly anyCase: boolean;
  /** The query Vite loads each file with, from its `?`, where the call names one: `query`, or the `as` that names it. */
  readonly query?: string | undefined;
}

/** What a piece loads through `import.meta`: its globs, the modules `new URL(…, import.meta.url)` names, and the globs it does not write as Vite reads them. */
export interface MetaLoads {
  readonly globs: readonly GlobLoad[];
  /** What `new URL()` names with a string, or a template with no insertion: a module beside the file, a worker's. */
  readonly urls: readonly string[];
  /** What it names with a template with insertions: the part before the first. */
  readonly madeUp: readonly string[];
  /** Where each glob starts that takes what is not a literal: its offset in the piece. */
  readonly unread: readonly number[];
}

/* The most patterns a glob is read with. */
const MAX_PATTERNS = 256;

/* What a template before its first insertion writes — `./icons/` of `./icons/${name}.svg` — as written, which Vite reads a pattern's by, or as it evaluates, as an option's. */
function prefixOf(node: unknown, read: "raw" | "cooked" = "raw"): string | undefined {
  if (!isNode(node) || node.type !== "TemplateLiteral" || !Array.isArray(node.quasis))
    return undefined;
  const [quasi] = node.quasis;
  const text = isNode(quasi) && isRecord(quasi.value) ? quasi.value[read] : undefined;
  return typeof text === "string" ? text : undefined;
}

/* A string written as a literal: a string, or a template with no insertion, its text as written or as evaluated. */
function literal(node: unknown, read: "raw" | "cooked" = "raw"): string | undefined {
  if (!isNode(node)) return undefined;
  if (node.type === "Literal") return typeof node.value === "string" ? node.value : undefined;
  if (node.type !== "TemplateLiteral" || !Array.isArray(node.expressions)) return undefined;
  return node.expressions.length === 0 ? prefixOf(node, read) : undefined;
}

/* The query a glob's `query` or `as` names, as Vite writes it: a string, from its `?`, or an object of literals. */
function queryOf(node: unknown): string | undefined {
  const written = literal(node, "cooked");
  if (written !== undefined) return written.startsWith("?") ? written : `?${written}`;
  if (!isNode(node) || node.type !== "ObjectExpression" || !Array.isArray(node.properties))
    return undefined;
  const items = node.properties.flatMap((property) => {
    if (!isNode(property) || property.type !== "Property" || property.computed === true) return [];
    const key = nameOf(property.key) ?? literal(property.key, "cooked");
    const value = isNode(property.value) ? property.value.value : undefined;
    if (key === undefined || !["string", "number", "boolean"].includes(typeof value)) return [];
    return [String(value) === "" ? key : `${key}=${String(value)}`];
  });
  return items.length > 0 ? `?${items.join("&")}` : undefined;
}

/* A glob call's patterns and options, as Vite reads them: literals alone; none where one is not. */
function globOf(call: AstNode): GlobLoad | undefined {
  const [first, options, ...more] = Array.isArray(call.arguments) ? call.arguments : [];
  const elements = isNode(first) && first.type === "ArrayExpression" ? first.elements : [first];
  const patterns = Array.isArray(elements) ? elements.map((each) => literal(each)) : [];
  if (more.length > 0 || patterns.length === 0 || patterns.length > MAX_PATTERNS) return undefined;
  if (!patterns.every((each): each is string => each !== undefined)) return undefined;
  if (options === undefined) return { patterns, base: undefined, anyCase: false };
  if (!isNode(options) || options.type !== "ObjectExpression") return undefined;
  const properties = Array.isArray(options.properties) ? options.properties : [];
  let base: string | undefined;
  let anyCase = false;
  let query: string | undefined;
  for (const property of properties) {
    if (!isNode(property) || property.type !== "Property" || property.computed === true)
      return undefined;
    const key = nameOf(property.key) ?? literal(property.key, "cooked");
    if (key === "base") base = literal(property.value, "cooked");
    if (key === "base" && !/^[./]/.test(base ?? "")) return undefined;
    if (key === "caseSensitive" && isNode(property.value)) anyCase = property.value.value === false;
    if (key === "query" || key === "as") query = queryOf(property.value);
  }
  return { patterns, base, anyCase, query };
}

/**
 * What a piece of code loads through `import.meta`, read from each call
 * of it alone — from the piece's tree only where a call's text is not
 * told alone: each `import.meta.glob` whose patterns and options are
 * literals, as Vite takes them — strings, or templates with no
 * insertion; one that takes anything else, which Vite does not build, is
 * told by where it starts — and each module `new URL(…,
 * import.meta.url)` names from the file's folder, a worker's among them:
 * by a literal, or, by a template with insertions, the folder its first
 * part names.
 *
 * @param piece - The piece's text, the extension it parses as, and where its `import.meta` is
 * @param tree - The piece's tree, asked for where a call is not told alone
 * @returns What it loads
 * @example
 * ```ts
 * metaLoads({ text, parseAs: ".ts", metas }, () => programOf(parsed.program)).globs[0]?.patterns; // ["./pages/*.tsx"]
 * ```
 */
export function metaLoads(piece: MetaPiece, tree: () => AstNode): MetaLoads {
  const loads = { globs: [] as GlobLoad[], urls: [] as string[], madeUp: [] as string[] };
  const unread: number[] = [];
  for (const { node, at } of metaCalls(piece) ?? callsIn(tree())) {
    if (node.type === "CallExpression") {
      const glob = globOf(node);
      if (glob === undefined) unread.push(at);
      else loads.globs.push(glob);
      continue;
    }
    const [specifier] = Array.isArray(node.arguments) ? node.arguments : [];
    const written = literal(specifier);
    const relative = (path: string | undefined) => path?.startsWith(".") === true;
    if (written !== undefined && relative(written)) loads.urls.push(written);
    else if (written === undefined && relative(prefixOf(specifier)))
      loads.madeUp.push(prefixOf(specifier) ?? "");
  }
  return { ...loads, unread };
}
