import { posix } from "node:path";

import type { ProjectCode } from "../codemod/source-files";
import type { Workspace } from "../workspace";
import { throughLinks } from "./file-probe";
import type { PackageFramework, PieceFacts } from "./framework-roots";
import { type GlobIn, globFiles } from "./glob-imports";
import { basesOf, resolverOf } from "./import-resolution";
import type { GlobLoad } from "./meta-loads";
import { type ModuleRecord, moduleRecord, type PieceRecord } from "./module-records";
import { type StartGraph, startGraph, startWorkspace } from "./start-imports";
import { isToolConfig, toolRecord } from "./tool-configs";
import { type UnreadNode, unreadNodes } from "./unread-nodes";
import type { WorkspacePackages } from "./workspace-packages";

/** A piece of the workspace's code, and where its imports lead. */
export interface GraphNode {
  readonly path: string;
  readonly facts: PieceFacts;
  readonly record: PieceRecord;
  readonly framework: PackageFramework;
  /** The files it loads for certain, those a page's conditions and the server's give it alone, those it may load, and the packages any of whose files it may. */
  readonly files: readonly string[];
  readonly pageFiles: readonly string[];
  readonly serverFiles: readonly string[];
  /** The files it may load for one side alone, beside those it may load for both. */
  readonly pageLoose: readonly string[];
  readonly serverLoose: readonly string[];
  readonly loose: readonly string[];
  readonly packages: readonly string[];
  /** The files and folders the graph could not read that it may load. */
  readonly unread: readonly number[];
  /** The files every import of which takes their default alone. */
  readonly defaultAlone: ReadonlySet<string>;
}

/* A file's record whose every piece parsed. */
type ReadRecord = Extract<ModuleRecord, { readonly pieces: readonly PieceRecord[] }>;
/* How many paths the workspace's globs test, one at a time, before each further one is read as every file under its folder. */
const GLOB_TESTS = 2_000_000;

/* The list a map keeps under a key, made where there is none yet. */
const listed = (map: Map<string, number[]>, key: string): number[] =>
  map.get(key) ?? (map.set(key, []).get(key) as number[]);

/** The workspace's pieces of code, each with where its imports lead, and what the graph could not read. */
export interface ImportGraph {
  readonly nodes: readonly GraphNode[];
  readonly byFile: ReadonlyMap<string, readonly number[]>;
  readonly byPackage: ReadonlyMap<string, readonly number[]>;
  readonly unread: readonly UnreadNode[];
  /** Each `import.meta.glob` that takes what is not a literal, by its file and line: what it loads is not read. */
  readonly unreadGlobs: ReadonlyArray<{ readonly file: string; readonly line: number }>;
  /** What the graph read of TanStack Start's pieces: what a file's import of a name is to Start's compiler, and the files a page may load only through an import a function Courier did not follow may drop. */
  readonly start: Pick<StartGraph, "resolve" | "unfollowed">;
}

/**
 * The graph of a workspace's imports: each piece of each file of its
 * code, read once, with the files its imports — and its globs — name for certain, those
 * its `require()` and its aliases nothing resolves may name, the
 * packages any of whose files it may load — a package named by its name,
 * an `import()` of a specifier made up at run time — and the files and
 * folders the walk did not read, or that do not parse, that it may. A
 * tool's config loads nothing as the graph reads it.
 *
 * @param workspace - The workspace
 * @param code - Its code, as the walk read it
 * @param packages - Its packages
 * @returns The graph
 * @example
 * ```ts
 * importGraph(workspace, projectCode(root), workspacePackages(workspace)).nodes.length;
 * ```
 */
export function importGraph(
  workspace: Workspace,
  code: ProjectCode,
  packages: WorkspacePackages,
): ImportGraph {
  const paths = new Set(code.paths);
  const keep = startWorkspace(code.paths, packages);
  const records = code.paths.map((path) =>
    isToolConfig(path) ? toolRecord(path) : moduleRecord(workspace.root, path, keep),
  );
  const unparsed = records.flatMap((record) => ("unreadable" in record ? [record] : []));
  const unread = unreadNodes(workspace.root, code, unparsed, packages);
  const input = {
    root: workspace.root,
    paths,
    links: code.links,
    unreadAt: unread.at,
    ...packages,
    frameworkOf: (dir: string) => packages.frameworkOf(dir).id,
  };
  const resolve = resolverOf(input);
  const start = startGraph(records, resolve);
  /* The files a piece's globs load, matched against the walk's files sorted once, the first time a glob asks. */
  let globIn: GlobIn | undefined;
  const budget = { left: GLOB_TESTS };
  const globInput = () => {
    globIn ??= {
      sorted: [...code.paths].sort(),
      packageOf: packages.packageOf,
      aliased: (from, specifier) => basesOf(input, from, specifier),
      throughLinks: (each) => throughLinks(code.links, each),
    };
    return globIn;
  };
  const globbed = (path: string, globs: readonly GlobLoad[]) => {
    if (globs.length === 0) return { files: [], loose: [] };
    const within = globInput();
    const matched = globs.map((glob) => globFiles(within, path, glob, budget));
    return {
      files: matched.flatMap((each) => each.files),
      loose: matched.flatMap((each) => each.loose),
    };
  };
  /* What a specifier made up at run time may load: every file under the folder a relative template names, else any of the package's. */
  const madeUp = (path: string, dir: string, prefix: string) => {
    if (!prefix.startsWith(".")) return { files: [], packages: [dir] };
    const folder = posix.join(posix.dirname(path), prefix);
    return { files: code.paths.filter((each) => each.startsWith(folder)), packages: [] };
  };
  const nodes: GraphNode[] = [];
  const byFile = new Map<string, number[]>();
  const byPackage = new Map<string, number[]>();
  for (const record of records.filter((each): each is ReadRecord => "pieces" in each)) {
    const { path } = record;
    const dir = packages.packageOf(path);
    for (const piece of record.pieces) {
      const { framework, local } = packages.placeOf(path);
      const sided = start.targets(path, piece, framework.id, local);
      const imports = piece.imports.map((specifier) => sided(resolve(path, specifier), specifier));
      const globs = globbed(path, piece.globs);
      const alone = new Set(piece.defaultAlone);
      const filesBy = (whole: boolean) =>
        imports.flatMap((each, at) =>
          alone.has(piece.imports[at] ?? "") === whole ? each.files : [],
        );
      const run = new Set([...filesBy(false), ...globs.files]);
      const requires = piece.requires.map((specifier) => resolve(path, specifier));
      const made = piece.madeUp.map((prefix) => madeUp(path, dir, prefix));
      const id = nodes.length;
      nodes.push({
        path,
        facts: {
          path: local,
          kind: piece.kind,
          directive: piece.directive,
          exportsDefault: piece.exportsDefault,
          exports: piece.exports,
          startCode: piece.startCode,
        },
        record: piece,
        framework,
        files: [...imports.flatMap((each) => each.files), ...globs.files],
        pageFiles: imports.flatMap((each) => each.page),
        serverFiles: imports.flatMap((each) => each.server),
        loose: [
          ...globs.loose,
          ...imports.flatMap((each) => each.loose),
          ...requires.flatMap((each) => [...each.files, ...each.loose]),
          ...made.flatMap((each) => each.files),
        ],
        pageLoose: [...imports, ...requires].flatMap((each) => [...each.page, ...each.pageLoose]),
        serverLoose: [...imports, ...requires].flatMap((each) => [
          ...each.server,
          ...each.serverLoose,
        ]),
        packages: [...imports, ...requires, ...made].flatMap((each) => each.packages),
        unread: [...new Set([...imports, ...requires].flatMap((each) => each.unread))],
        defaultAlone: new Set(filesBy(true).filter((file) => !run.has(file))),
      });
      listed(byFile, path).push(id);
      listed(byPackage, dir).push(id);
    }
  }
  const unreadGlobs = records.flatMap((record) =>
    "pieces" in record
      ? record.pieces.flatMap((piece) =>
          piece.unreadGlobs.map((line) => ({ file: record.path, line })),
        )
      : [],
  );
  return { nodes, byFile, byPackage, unread: unread.nodes, unreadGlobs, start };
}
