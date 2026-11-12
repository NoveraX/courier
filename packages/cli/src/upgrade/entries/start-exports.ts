import { type AstNode, isNode, programOf } from "../codemod/ast";
import { keyOf } from "../codemod/literals";
import { parseCode } from "../codemod/oxc-parse";
import type { Targets } from "./import-resolution";
import type { ModuleRecord, PieceRecord } from "./module-records";
import {
  builtFrom,
  FUNCTIONS,
  functionOf,
  type StartFunction,
  type StartResolved,
  startNamesOf,
  statementsOf,
} from "./start-calls";
import { ROUTER_PACKAGES, START_PACKAGES } from "./start-code";

/** What a module exports that Start's compiler may take for a function of Start's, read from the module alone: by the name it is exported under, the function — and whether a call or a method made a builder of it — or the export of another module it comes to; and the modules it exports every name of. */
export interface StartExports {
  readonly names: Readonly<Record<string, StartExport>>;
  readonly all: readonly string[];
}

/** One export a module gives: a function of Start's, or another module's export. */
export type StartExport =
  | { readonly fn: string; readonly built: boolean }
  | { readonly from: string; readonly name: string; readonly built: boolean };

/** What the graph reads a piece Start builds by: its tree, what it loads beside its imports — the modules its `new URL()` names — and whether it makes a route. */
export interface StartTree {
  readonly program: AstNode;
  readonly kept: readonly string[];
  readonly routes: boolean;
}

/** A piece's text, where its workspace builds with Start and it exports something, for the graph to read what it exports by once an import comes to it: the text, and the language it is parsed as. */
export interface StartText {
  readonly text: string;
  readonly parseAs: string;
}

/* A route's call, by which Start's router reads its options. */
const ROUTE_CALL = /\bcreate(?:File|Root)Route/;

/**
 * What a piece's record holds for TanStack Start: its tree, where it
 * imports Start's or Router's packages, for the graph to read its sides
 * by; and, for another piece that exports something in a workspace that
 * builds with Start, its text, which the graph reads what it exports by
 * only once an import comes to it — every form of export as Start's
 * compiler reads it, and no tree asked for the rest.
 *
 * @param text - The piece's text
 * @param imports - Its imports of values, as oxc's record of it gives them
 * @param program - Its tree, asked for once
 * @param kept - What it loads beside its imports: the modules its `new URL()` names
 * @param keep - The language its text is parsed as, where it is kept: none to keep none
 * @returns The fields of its record
 * @example
 * ```ts
 * startRecordOf(text, values, program, [], undefined).startTree?.routes; // false where it imports @tanstack/react-start
 * ```
 */
export function startRecordOf(
  text: string,
  imports: ReadonlyArray<{ readonly moduleRequest: { readonly value: string } }>,
  program: () => AstNode,
  kept: readonly string[],
  keep: string | undefined,
): { readonly startTree?: StartTree; readonly startText?: StartText } {
  const start = imports.some(({ moduleRequest: { value } }) =>
    [START_PACKAGES, ROUTER_PACKAGES].some((each) => each.test(value)),
  );
  if (start) return { startTree: { program: program(), kept, routes: ROUTE_CALL.test(text) } };
  return keep === undefined ? {} : { startText: { text, parseAs: keep } };
}

/* An export, as what a function of Start's the module's own value resolves to gives it. */
function exportOf(found: StartFunction | undefined, built: boolean): StartExport | undefined {
  if (found === undefined) return undefined;
  return typeof found === "string"
    ? { fn: found, built }
    : { from: found.from, name: found.name, built };
}

/**
 * What a module exports that Start's compiler may take for a function of
 * Start's, as it reads a module's exports: a declaration's binding, a
 * name exported by `export { … }` or `export default`, a re-export of a
 * name, and `export *`, each read by the module's own names, and another
 * module's left to be followed into it.
 *
 * @param program - The module's tree
 * @returns Its exports of Start's functions, and the modules it exports whole
 * @example
 * ```ts
 * startExportsOf(program).names.authed; // { fn: "createServerFn", built: true } for `export const authed = createServerFn().middleware([auth])`
 * ```
 */
export function startExportsOf(program: AstNode): StartExports {
  const names = startNamesOf(program);
  const out: Record<string, StartExport> = {};
  const all: string[] = [];
  const exportedValue = (node: unknown) =>
    exportOf(functionOf(names, node), false) ?? exportOf(builtFrom(names, node), true);
  const set = (name: string | undefined, found: StartExport | undefined) => {
    if (name !== undefined && found !== undefined) out[name] = found;
  };
  for (const statement of statementsOf(program)) {
    const source = isNode(statement.source) ? String(statement.source.value) : undefined;
    if (
      statement.type === "ExportAllDeclaration" &&
      source !== undefined &&
      statement.exported == null
    )
      all.push(source);
    if (statement.type === "ExportDefaultDeclaration")
      set("default", exportedValue(statement.declaration));
    if (statement.type !== "ExportNamedDeclaration" || statement.exportKind === "type") continue;
    const declared = isNode(statement.declaration) ? statement.declaration : undefined;
    const declarators = Array.isArray(declared?.declarations) ? declared.declarations : [];
    for (const each of [...declarators.filter(isNode).map((at) => at.id), declared?.id].filter(
      isNode,
    ))
      set(String(each.name), exportedValue(each));
    for (const each of Array.isArray(statement.specifiers)
      ? statement.specifiers.filter(isNode)
      : []) {
      const [local, exported] = [keyOf(each.local), keyOf(each.exported)];
      if (local === undefined || each.exportKind === "type") continue;
      if (source === undefined)
        set(exported, exportedValue({ type: "Identifier", name: local, start: 0, end: 0 }));
      else if (!START_PACKAGES.test(source))
        set(exported, { from: source, name: local, built: false });
      else if (FUNCTIONS.has(local)) set(exported, { fn: local, built: false });
    }
  }
  return { names: out, all };
}

/**
 * How the graph follows a module's import of a name into the module it
 * names, as Start's compiler follows it: to the export of a module the
 * graph read, through the exports of other modules it comes to and the
 * modules it exports whole, to a function of Start's; a module of Start's
 * gives its own. One that leads to no module the graph read, or to a file
 * it could not read, is not followed.
 *
 * @param recordOf - Each file's record, by its path
 * @param resolve - Where a file's import of a module leads
 * @returns What a file's import of a name is, by the file, the module, and the name
 * @example
 * ```ts
 * startResolver(recordOf, resolve)("src/routes/a.tsx", "../lib/fns", "authed"); // { fn: "createServerFn", built: true }
 * ```
 */
export function startResolver(
  recordOf: (path: string) => ModuleRecord | undefined,
  resolve: (from: string, specifier: string) => Targets,
): (from: string, source: string, name: string) => StartResolved | undefined {
  const read = new Map<string, StartExports | undefined>();
  /* What a module exports, read from its tree or its text the first time an import comes to it. */
  const exportsAt = (path: string, piece: PieceRecord | undefined) => {
    if (read.has(path)) return read.get(path);
    const kept = piece?.startText;
    const program =
      piece?.startTree?.program ??
      (kept === undefined
        ? undefined
        : programOf(parseCode(`piece${kept.parseAs}`, kept.text).program));
    const exports = program === undefined ? undefined : startExportsOf(program);
    read.set(path, exports);
    return exports;
  };
  const follow = (
    from: string,
    source: string,
    name: string,
    seen: Set<string>,
  ): StartResolved | undefined => {
    if (START_PACKAGES.test(source))
      return FUNCTIONS.has(name) ? { fn: name, built: false } : undefined;
    const key = `${from}\n${source}\n${name}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    const { files, page, server } = resolve(from, source);
    const paths = [...new Set([...files, ...page, ...server])];
    if (paths.length === 0) return "unfollowed";
    for (const path of paths) {
      const record = recordOf(path);
      if (record === undefined || !("pieces" in record)) return "unfollowed";
      const exports = exportsAt(
        path,
        record.pieces.find((each) => each.kind === "module"),
      );
      const found = exports?.names[name];
      if (found !== undefined && "fn" in found) return found;
      const through =
        found === undefined
          ? (exports?.all ?? []).map((each) => follow(path, each, name, seen))
          : [];
      const next =
        found === undefined
          ? (through.find((each) => each !== undefined && each !== "unfollowed") ??
            through.find((each) => each !== undefined))
          : follow(path, found.from, found.name, seen);
      if (next !== undefined && next !== "unfollowed" && found !== undefined)
        return { fn: next.fn, built: found.built || next.built };
      if (next !== undefined) return next;
    }
    return undefined;
  };
  return (from, source, name) => follow(from, source, name, new Set());
}
