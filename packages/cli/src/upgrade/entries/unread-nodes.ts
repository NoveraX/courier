import type { PieceKind, ProjectCode } from "../codemod/source-files";
import { type Directive, type PackageFramework, type PieceRoots, rootsOf } from "./framework-roots";
import { headDirective } from "./module-records";
import { isToolConfig } from "./tool-configs";
import type { WorkspacePackages } from "./workspace-packages";

/** A file or folder of the workspace's code the graph could not read: what it loads is not known. */
export interface UnreadNode {
  readonly path: string;
  /** The folder of its package. */
  readonly dir: string;
  /** Every root its path, and what is read of it, may make it. */
  readonly roots: PieceRoots;
  /** The directive it opens with; `"unknown"` where that is not read. */
  readonly directive: Directive | undefined | "unknown";
}

/** The workspace's unread files and folders, and which one a path is, or is in. */
export interface UnreadNodes {
  readonly nodes: readonly UnreadNode[];
  readonly at: (path: string) => number | undefined;
}

const DIRECTIVES: ReadonlyArray<Directive | undefined> = [undefined, "use client", "use server"];
const NONE: PieceRoots = { page: false, server: false, split: false };
const BOTH: PieceRoots = { page: true, server: true, split: false };

/* The kinds of piece a file may have, by its extension. */
function kindsOf(path: string): PieceKind[] {
  if (path.endsWith(".astro")) return ["frontmatter", "script"];
  return /\.(?:vue|svelte)$/.test(path) ? ["script"] : ["module"];
}

/* Every root a file may be whose code is not read: of each kind of piece it may have, opening with each directive it may, with a default or without. */
function possibleRoots(
  framework: PackageFramework,
  path: string,
  directive: UnreadNode["directive"],
): PieceRoots {
  const roots = { ...NONE };
  for (const kind of kindsOf(path))
    for (const each of directive === "unknown" ? DIRECTIVES : [directive])
      for (const exportsDefault of [true, false]) {
        const one = rootsOf(framework, { path, kind, directive: each, exportsDefault });
        roots.page ||= one.page;
        roots.server ||= one.server;
        roots.split ||= one.split;
      }
  /* Beside a server framework, a file no page is known to reach may be the server's. */
  roots.server ||= framework.withServer === true && !isToolConfig(path);
  return roots;
}

/**
 * The files and folders of the workspace's code the graph could not read
 * — one too large, a link out of the workspace, a folder past the walk's
 * depth, a file that does not parse — each a node whose imports are not
 * known, and every root of a page's or the server's its path and the
 * directive it opens with may make it. A folder of a package whose
 * framework the upgrade knows may hold either side's roots, but not one
 * whose page beside a server it is not told where it starts.
 *
 * @param root - The workspace's folder
 * @param code - Its code, as the walk read it
 * @param unparsed - The files read that do not parse, each with the directive it opens with
 * @param packages - Its packages
 * @returns The nodes, and which one a path is or is in
 * @example
 * ```ts
 * unreadNodes(root, code, [], packages).at("lib/schema.ts"); // 0, where lib/schema.ts is too large to read
 * ```
 */
export function unreadNodes(
  root: string,
  code: ProjectCode,
  unparsed: ReadonlyArray<{ readonly path: string; readonly directive: Directive | undefined }>,
  packages: WorkspacePackages,
): UnreadNodes {
  const nodes: UnreadNode[] = [];
  const files = new Map<string, number>();
  const folders = new Map<string, number>();
  const add = (path: string, folder: boolean, directive: UnreadNode["directive"]) => {
    const dir = packages.packageOf(path);
    const { framework, local } = packages.placeOf(path);
    /* A folder may hold either side's roots, but where no framework is known, or a page beside a server whose start is not read. */
    const known = framework.id === undefined || framework.pageEntries?.size === 0 ? NONE : BOTH;
    (folder ? folders : files).set(path, nodes.length);
    nodes.push({
      path,
      dir,
      roots: folder ? known : possibleRoots(framework, local, directive),
      directive,
    });
  };
  for (const each of code.unread)
    add(each.path, each.folder, each.folder ? "unknown" : headDirective(root, each.path));
  for (const each of unparsed) add(each.path, false, each.directive);
  return {
    nodes,
    at(path) {
      const file = files.get(path);
      if (file !== undefined || folders.size === 0) return file;
      for (let end = path.lastIndexOf("/"); end > 0; end = path.lastIndexOf("/", end - 1)) {
        const folder = folders.get(path.slice(0, end));
        if (folder !== undefined) return folder;
      }
      return undefined;
    },
  };
}
