import { closeSync, lstatSync, openSync, readFileSync, readSync } from "node:fs";
import { join } from "node:path";
import { parseSync } from "oxc-parser";

import { type AstNode, programOf } from "../codemod/ast";
import { type CodePiece, codePieces, type PieceKind } from "../codemod/source-files";
import { lineAt } from "../codemod/text-edits";
import type { Directive } from "./framework-roots";
import { type GlobLoad, metaLoads } from "./meta-loads";
import { type StartCode, startCodeOf } from "./start-code";
import { type StartText, type StartTree, startRecordOf } from "./start-exports";

/** What a piece of code loads, as the graph of imports reads it. */
export interface PieceRecord {
  readonly kind: PieceKind;
  readonly directive: Directive | undefined;
  readonly exportsDefault: boolean;
  /** The names it exports, `*` for an `export *`. */
  readonly exports: readonly string[];
  /** The modules it loads for certain: its imports and re-exports that are not of types alone, and `import()` of a string. */
  readonly imports: readonly string[];
  /** The modules `require()` of a string names in its text: maybe loaded, as text is read without its syntax. */
  readonly requires: readonly string[];
  /** What it loads by a specifier it makes up: the part a template writes before its first insertion, `""` where nothing is written. */
  readonly madeUp: readonly string[];
  /** The modules every import of which takes their default alone: a component an Astro page renders. */
  readonly defaultAlone: readonly string[];
  /** The globs `import.meta.glob` loads modules by. */
  readonly globs: readonly GlobLoad[];
  /** Where an `import.meta.glob` takes what is not a literal, which Vite does not build: its offset in the piece, its line in the file once the file is read. */
  readonly unreadGlobs: readonly number[];
  /** What TanStack Start keeps of it to one side as it builds: its server functions, a route of server handlers alone, a module of one side's marker. */
  readonly startCode?: StartCode | undefined;
  /** For a piece that imports Start's or Router's packages, what the graph reads its sides by as Start builds it: its tree, what it loads beside its imports — the modules its `new URL()` names — and whether it makes a route. */
  readonly startTree?: StartTree | undefined;
  /** Its text, where its workspace builds with Start and it exports something, for the graph to read what it exports by once an import comes to it. */
  readonly startText?: StartText | undefined;
}

/** A file of code as the graph reads it: its pieces, or that it could not be read whole, and the directive it opens with. */
export type ModuleRecord =
  | { readonly path: string; readonly pieces: readonly PieceRecord[] }
  | { readonly path: string; readonly unreadable: true; readonly directive: Directive | undefined };

const REQUIRE = /\brequire\s*\(\s*(["'])([^"'\n]{1,512})\1\s*\)/g;
/* A declaration of types alone, which loads nothing at run time: `import type …`, `export type … from`. */
const TYPES_DECLARATION = /^(?:import|export)\s+type\b/;
/* A declaration file, whose imports load nothing at run time. */
const TYPES_ONLY = /\.d\.[cm]?ts$/;
const DIRECTIVE = /^(["'])(use client|use server)\1/;
/* How much of a file too large to read is read for the directive it opens with. */
const HEAD_BYTES = 64 * 1024;

/* Past the spaces and comments a text starts with: where its first statement is. */
function codeStart(text: string): number {
  let at = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    while (at < text.length && /\s/.test(text[at] ?? "")) at++;
    if (text.startsWith("//", at)) {
      const end = text.indexOf("\n", at);
      at = end === -1 ? text.length : end;
    } else if (text.startsWith("/*", at)) {
      const end = text.indexOf("*/", at + 2);
      at = end === -1 ? text.length : end + 2;
    } else return at;
  }
}

/* The directive a text opens with, past its spaces and comments. */
function directiveOf(text: string): Directive | undefined {
  const opening = DIRECTIVE.exec(text.slice(codeStart(text)))?.[2];
  return opening === "use client" || opening === "use server" ? opening : undefined;
}

/* An `import()`'s specifier as it is written: a string, a template with or without insertions, or anything else. */
function dynamicSpecifier(
  written: string,
): { readonly literal: string } | { readonly prefix: string } {
  const quoted = /^(["'])([\s\S]*)\1$/.exec(written);
  if (quoted) return { literal: quoted[2] ?? "" };
  if (!written.startsWith("`")) return { prefix: "" };
  const at = written.indexOf("${");
  return at === -1 ? { literal: written.slice(1, -1) } : { prefix: written.slice(1, at) };
}

/* A piece's record, from oxc's record of its module: the tree, which costs more than the parse itself to hand over, is asked for only where a call of import.meta's is not told from its own text. */
function pieceRecord({ kind, parseAs, text }: CodePiece, keep: boolean): PieceRecord | undefined {
  const parsed = parseSync(`piece${parseAs}`, text);
  if (parsed.errors.length > 0) return undefined;
  const { staticImports, staticExports, dynamicImports, importMetas } = parsed.module;
  const ofValues = (span: { readonly start: number; readonly end: number }) =>
    !TYPES_DECLARATION.test(text.slice(span.start, span.end));
  const values = staticImports.filter(ofValues);
  const reexports = staticExports
    .filter(ofValues)
    .flatMap((each) => [
      ...new Set(each.entries.flatMap((entry) => entry.moduleRequest?.value ?? [])),
    ]);
  const imports = [...values.map((each) => each.moduleRequest.value), ...reexports];
  /* Whether every import of a module takes its default alone; a re-export or an `import()` of it runs it. */
  const alone = new Map<string, boolean>();
  for (const each of values) {
    const names = each.entries.filter((entry) => !entry.isType);
    const only = names.length === 1 && names[0]?.importName.kind === "Default";
    alone.set(each.moduleRequest.value, (alone.get(each.moduleRequest.value) ?? true) && only);
  }
  for (const specifier of reexports) alone.set(specifier, false);
  const madeUp: string[] = [];
  for (const { moduleRequest } of dynamicImports) {
    const written = dynamicSpecifier(text.slice(moduleRequest.start, moduleRequest.end));
    if ("literal" in written) {
      imports.push(written.literal);
      alone.set(written.literal, false);
    } else madeUp.push(written.prefix);
  }
  /* Each call of import.meta's is read from its own text: the tree costs more than the parse, the larger the file the more, and is read once, where asked for. */
  let tree: AstNode | undefined;
  const program = () => (tree ??= programOf(parsed.program));
  const meta = metaLoads({ text, parseAs, metas: importMetas }, program);
  const keepAs = keep && staticExports.length > 0 ? parseAs : undefined;
  for (const url of meta.urls) {
    imports.push(url);
    alone.set(url, false);
  }
  madeUp.push(...meta.madeUp);
  return {
    kind,
    directive: directiveOf(text),
    exportsDefault: staticExports.some((each) =>
      each.entries.some((entry) => entry.exportName.kind === "Default"),
    ),
    exports: staticExports.flatMap((each) =>
      each.entries.map(({ exportName }) =>
        exportName.kind === "Default" ? "default" : (exportName.name ?? "*"),
      ),
    ),
    imports,
    requires: [...text.matchAll(REQUIRE)].map((match) => match[2] ?? ""),
    madeUp,
    defaultAlone: [...alone].flatMap(([specifier, only]) => (only ? [specifier] : [])),
    globs: meta.globs,
    unreadGlobs: meta.unread,
    startCode: startCodeOf(values, text),
    ...startRecordOf(text, values, program, meta.urls, keepAs),
  };
}

/**
 * A file of the project's code as the graph of imports reads it: each of
 * its pieces — the module, a component's `<script>`, an Astro file's
 * frontmatter — with the modules it loads, its globs among them, the
 * directive its file opens with, and whether it exports a default. A file a piece of which does
 * not parse is unreadable: what it loads is not known. A `.d.ts` file
 * has no pieces, as nothing of it runs.
 *
 * @param root - The workspace's folder
 * @param path - The file, relative to the root
 * @param keep - Whether its workspace builds with TanStack Start, so that a piece that exports something keeps its text
 * @returns Its record
 * @example
 * ```ts
 * moduleRecord(root, "src/app/page.tsx"); // { path, pieces: [{ kind: "module", imports: ["@/lib/api"], … }] }
 * ```
 */
export function moduleRecord(root: string, path: string, keep = false): ModuleRecord {
  if (TYPES_ONLY.test(path)) return { path, pieces: [] };
  const text = readFileSync(join(root, path), "utf8");
  const pieces: PieceRecord[] = [];
  for (const piece of codePieces(path, text)) {
    const record = pieceRecord(piece, keep);
    if (record === undefined) return { path, unreadable: true, directive: directiveOf(text) };
    const lines = record.unreadGlobs.map((at) => lineAt(text, piece.offset + at));
    pieces.push({ ...record, unreadGlobs: lines });
  }
  return { path, pieces };
}

/**
 * The directive a file too large to read opens with, read from its first
 * bytes alone. `"unknown"` where they hold only spaces and comments, and
 * for a link: the walk reads no file a link leads to by the link.
 *
 * @param root - The workspace's folder
 * @param path - The file, relative to the root
 * @returns The directive, none, or that it is not known
 * @example
 * ```ts
 * headDirective(root, "app/chart.tsx"); // "use client"
 * ```
 */
export function headDirective(root: string, path: string): Directive | undefined | "unknown" {
  let text: string;
  try {
    if (lstatSync(join(root, path)).isSymbolicLink()) return "unknown";
    const fd = openSync(join(root, path), "r");
    try {
      const head = Buffer.alloc(HEAD_BYTES);
      text = head.subarray(0, readSync(fd, head, 0, HEAD_BYTES, 0)).toString("utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return "unknown";
  }
  /* A directive the head cuts off is not known to be one. */
  return codeStart(text) > text.length - "'use client'".length ? "unknown" : directiveOf(text);
}
