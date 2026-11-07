import type { ProjectCode } from "../codemod/source-files";
import type { Workspace } from "../workspace";
import type { PackageFrameworkId } from "./framework-roots";
import { importGraph } from "./import-graph";
import { sideReaches } from "./side-reaches";
import type { SideReach } from "./side-spread";
import { workspacePackages } from "./workspace-packages";

/** Where a piece of code runs, as its framework's rules and the workspace's imports tell. */
export interface PieceSide {
  /** In a page's bundle for certain: a root of the page's, or imported from one. */
  readonly page: boolean;
  /** Maybe in a page's bundle: the framework splits it, or an import that may load it is a page's. */
  readonly maybePage: boolean;
  /** Maybe run as the server's code: a root of the server's, a split module, or what they may load. */
  readonly maybeServer: boolean;
  /** Whether a side may reach it only through code the graph could not read, or a walk stopped at its limit. */
  readonly incomplete: boolean;
  /** Its package's framework, where the upgrade knows it. */
  readonly framework: PackageFrameworkId | undefined;
  /** The package a page may load it through by its name alone, whose entry the graph could not follow to its code. */
  readonly pageThrough?: string | undefined;
  /** Whether its package's tsconfig keeps an import of types named one by one as a load of its module. */
  readonly keepsTypeImports?: boolean | undefined;
  /** How the server's code may reach it: from a root of the server's — for certain, or along an import that may lead on — through a file the graph could not read, or through a package whose entry it could not follow. */
  readonly serverVia?:
    | { readonly root: string; readonly may?: boolean }
    | { readonly unread: string }
    | { readonly package: string }
    | undefined;
}

/** The side of each piece of a workspace's code, worked out once. */
export interface ProjectSides {
  /**
   * @param path - The file, relative to the workspace's root
   * @param piece - Which of its pieces, in the order `codePieces` gives them
   */
  sideOf(path: string, piece: number): PieceSide;
  /** What the sides could not be told from, as steps of the plan: a Nuxt config whose layers are not data, an Expo config whose routes are not, a glob not written with literals. */
  notes(): ReadonlyArray<{ readonly file: string; readonly what: string }>;
}

/* What the plan says of what the sides could not be told from. */
const LAYERS =
  "Not read: its extends is not data Courier reads, so the layers it names are read without Nuxt's rules";
const GLOB =
  "Not read: its import.meta.glob takes what is not a literal, which Vite does not build either, so the files it names take no side from it";

function build(workspace: Workspace, code: ProjectCode): ProjectSides {
  const packages = workspacePackages(workspace);
  const graph = importGraph(workspace, code, packages);
  const { nodes, byFile, unread } = graph;
  const { page, maybePage, maybeServer, server } = sideReaches(graph, packages);
  /* A side that reaches a piece only through what the graph could not read. */
  const unseenBy = (reach: SideReach, id: number) => {
    const guess = reach.guessOf(id);
    return guess !== undefined && "unread" in guess;
  };
  const nameOf = (dir: string) => packages.projectOf(dir)?.manifest.name ?? dir;
  /* The package by whose name alone a page may load a piece. */
  const through = (id: number) => {
    const guess = maybePage.guessOf(id);
    return guess && "dir" in guess ? nameOf(guess.dir) : undefined;
  };
  /* How the server's code may reach a piece: the root it comes from first, for certain where it does, else the guess it came through. */
  const viaServer = (id: number) => {
    const loads = server.rootOf(id);
    if (loads !== undefined) return { root: nodes[loads]?.path ?? "" };
    const root = maybeServer.rootOf(id);
    if (root !== undefined) return { root: nodes[root]?.path ?? "", may: true };
    const guess = maybeServer.guessOf(id);
    if (guess === undefined) return undefined;
    return "dir" in guess
      ? { package: nameOf(guess.dir) }
      : { unread: unread[guess.unread]?.path ?? "" };
  };
  return {
    notes: () => [
      ...packages.unreadLayers().map((file) => ({ file, what: LAYERS })),
      ...packages.unreadConfigs(),
      ...graph.unreadGlobs.map(({ file, line }) => ({ file, what: `line ${line}: ${GLOB}` })),
    ],
    sideOf(path, piece) {
      const framework = packages.placeOf(path).framework.id;
      const id = byFile.get(path)?.[piece];
      const unseen = code.stopped || id === undefined;
      return {
        page: id !== undefined && page[id] === 1,
        maybePage: unseen || maybePage.reached[id] === 1,
        maybeServer: unseen || maybeServer.reached[id] === 1,
        incomplete: unseen || unseenBy(maybePage, id) || unseenBy(maybeServer, id),
        framework,
        pageThrough: id === undefined ? undefined : through(id),
        keepsTypeImports: packages.keepsTypeImports(packages.packageOf(path)),
        serverVia: id === undefined ? undefined : viaServer(id),
      };
    },
  };
}

/**
 * The side of each piece of a workspace's code: whether a page's bundle
 * has it for certain, may have it, and whether the server's code may run
 * it — from the roots its framework's rules give, along the imports of
 * the workspace's code, each read once. A Next.js client component a
 * server component imports, and an Astro component whose default alone a
 * page's frontmatter takes, are rendered, not run, by the server; a page takes references to
 * the functions of a module of server functions, not its code, under
 * Next.js and SolidStart. Where a server framework — Express, Koa and the
 * rest — runs beside a page's framework, what no page's file reaches — tests,
 * stories and what is served as it is aside — is the server's. A file or
 * folder the graph
 * could not read may load any piece of its package, and of the
 * workspace's packages it lists, as the side that reaches it — or whose
 * root its path makes it — loads them; one no side reaches changes no
 * side. A walk stopped at its limit leaves either side possible. The
 * graph is built at the first question, so a run that asks none reads
 * nothing.
 *
 * @param workspace - The workspace
 * @param code - Its code, as the walk read it
 * @returns The sides
 * @example
 * ```ts
 * projectSides(workspaceOf(root), projectCode(root)).sideOf("src/lib/api.ts", 0).maybeServer;
 * ```
 */
export function projectSides(workspace: Workspace, code: ProjectCode): ProjectSides {
  let built: ProjectSides | undefined;
  return {
    sideOf(path, piece) {
      built ??= build(workspace, code);
      return built.sideOf(path, piece);
    },
    notes: () => built?.notes() ?? [],
  };
}
