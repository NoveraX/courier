import { type AstNode, isNode, type Visited, walk } from "../codemod/ast";
import type { PackageFrameworkId } from "./framework-roots";
import type { Targets } from "./import-resolution";
import type { ModuleRecord, PieceRecord } from "./module-records";
import { isStartRoute, START } from "./path-rules";
import type { StartResolve, StartResolved } from "./start-calls";
import { startResolver } from "./start-exports";
import { type StartSplit, startSplit } from "./start-split";
import type { WorkspacePackages } from "./workspace-packages";

/** The modules a piece of code imports that a side's build of it drops every import of, as TanStack Start builds it; those the page's may drop, were the functions Courier did not follow Start's; and those functions, by name, with the module each comes from. */
export interface StartDrops {
  readonly page: readonly string[];
  readonly server: readonly string[];
  readonly maybe: readonly string[];
  readonly through: ReadonlyArray<readonly [string, string]>;
}

/** A file a page may load only through an import that a function Courier did not follow may take out of it: the file that imports it, and the function, by name, with the module it comes from. */
export interface StartNote {
  readonly file: string;
  readonly name: string;
  readonly from: string;
}

/** What the graph reads of TanStack Start's pieces as it builds: where their imports lead, what a file's import of a name is to Start's compiler, and the files of {@link StartNote}. */
export interface StartGraph {
  readonly targets: (
    path: string,
    piece: PieceRecord,
    framework: PackageFrameworkId | undefined,
    local: string,
  ) => (targets: Targets, specifier: string) => Targets;
  readonly resolve: (from: string, source: string, name: string) => StartResolved | undefined;
  readonly unfollowed: ReadonlyMap<string, StartNote>;
}

/* A way a piece loads a module that Start's build may drop: an import declaration's bindings, or an `import()`, where it is. */
type Load = { readonly bindings: readonly AstNode[] } | Visited;

/* The string an `import()` names its module by: a string, or a template with nothing put in it. */
function literalOf(source: unknown): string | undefined {
  if (!isNode(source)) return undefined;
  if (source.type === "Literal") return typeof source.value === "string" ? source.value : undefined;
  const parts =
    source.type === "TemplateLiteral" && Array.isArray(source.quasis) ? source.quasis : [];
  const [only] = parts;
  return parts.length === 1 && isNode(only) && isNode(only.value)
    ? String(only.value.cooked)
    : undefined;
}

/* Each way the piece loads each module, and the modules it loads some way Start's build never drops: an import of nothing, one with a type in it, a re-export. */
function loadsOf(program: AstNode): { loads: Map<string, Load[]>; always: Set<string> } {
  const loads = new Map<string, Load[]>();
  const always = new Set<string>();
  const add = (source: string, load: Load) =>
    loads.set(source, [...(loads.get(source) ?? []), load]);
  for (const statement of Array.isArray(program.body) ? program.body.filter(isNode) : []) {
    const source = isNode(statement.source) ? String(statement.source.value) : undefined;
    if (source === undefined || statement.importKind === "type" || statement.exportKind === "type")
      continue;
    const specifiers = Array.isArray(statement.specifiers)
      ? statement.specifiers.filter(isNode)
      : [];
    const typed = specifiers.some((each) => each.importKind === "type");
    if (statement.type !== "ImportDeclaration" || specifiers.length === 0 || typed)
      always.add(source);
    else
      add(source, {
        bindings: specifiers.flatMap((each) => (isNode(each.local) ? [each.local] : [])),
      });
  }
  walk(program, (visited) => {
    const source =
      visited.node.type === "ImportExpression" ? literalOf(visited.node.source) : undefined;
    if (source !== undefined) add(source, { ...visited, ancestors: [...visited.ancestors] });
  });
  return { loads, always };
}

/**
 * The modules a piece of code imports that a side's build of it drops
 * every import of, as TanStack Start builds it: an import whose bindings
 * that build keeps none of, and an `import()` in code it drops. An import
 * that takes nothing, or a type, a re-export and what the piece loads
 * some other way are kept. Those the page's build may drop besides, were
 * the functions of other modules Courier did not follow Start's, are
 * told apart, with the functions.
 *
 * @param program - The piece's tree
 * @param kept - What it loads some other way: the modules its `new URL()` names
 * @param route - Whether Start's router reads it as a route
 * @param resolve - How what other modules give is followed into them
 * @returns The modules each side's build drops, and those the page's may
 * @example
 * ```ts
 * startDropsOf(program, [], true, resolve).page; // ["../lib/db"] where only a server function's handler uses its import
 * ```
 */
export function startDropsOf(
  program: AstNode,
  kept: readonly string[],
  route: boolean,
  resolve: StartResolve,
): StartDrops {
  const { loads, always } = loadsOf(program);
  for (const each of kept) always.add(each);
  const keeps = (split: StartSplit, load: Load) =>
    "bindings" in load
      ? load.bindings.reduce(
          (sides, each) => {
            const binding = split.binding(each);
            return { page: sides.page || binding.page, server: sides.server || binding.server };
          },
          { page: false, server: false },
        )
      : split.node(load);
  const dropped = (split: StartSplit, side: "page" | "server") =>
    [...loads].flatMap(([source, ways]) =>
      always.has(source) || ways.some((each) => keeps(split, each)[side]) ? [] : [source],
    );
  const strict = startSplit(program, route, { resolve });
  const page = dropped(strict, "page");
  const server = dropped(strict, "server");
  /* Only a function Courier did not follow, met where a call may take code out, leaves a guess to make. */
  if (strict.met.size === 0) return { page, server, maybe: [], through: [] };
  const guess = startSplit(program, route, { guess: true, resolve });
  const maybe = dropped(guess, "page").filter((each) => !page.includes(each));
  return { page, server, maybe, through: [...(guess.guessed ?? [])] };
}

/**
 * Whether a workspace builds any of its packages with TanStack Start, so
 * that its modules keep what the graph reads their exports by.
 *
 * @param paths - The files of its code
 * @param packages - Its packages
 * @returns Whether one of them is Start's
 * @example
 * ```ts
 * startWorkspace(code.paths, packages); // true where an app lists @tanstack/react-start
 * ```
 */
export function startWorkspace(
  paths: readonly string[],
  packages: Pick<WorkspacePackages, "packageOf" | "frameworkOf">,
): boolean {
  const ids = new Set(paths.map((path) => packages.frameworkOf(packages.packageOf(path)).id));
  return [...START].some((id) => ids.has(id));
}

/**
 * What the graph reads of TanStack Start's pieces: where each import of a
 * piece Start builds leads once its build drops it on a side — to the
 * other side's files alone, nowhere where both drop it, and to the page
 * only as it may where a function Courier did not follow may drop it,
 * noting the files it leads to; and what a file's import of a name is to
 * Start's compiler, followed through the records of the modules the graph
 * read. A piece of another framework's leads as it did.
 *
 * @param records - The records of the workspace's files
 * @param resolve - Where a file's import of a module leads
 * @returns What the graph reads of Start's pieces
 * @example
 * ```ts
 * startGraph(records, resolve).targets(path, piece, "tanstack-start-react", local)(resolve(path, "../lib/db"), "../lib/db").page; // []
 * ```
 */
export function startGraph(
  records: readonly ModuleRecord[],
  resolve: (from: string, specifier: string) => Targets,
): StartGraph {
  const byPath = new Map(records.map((each) => [each.path, each]));
  const follow = startResolver((path) => byPath.get(path), resolve);
  const unfollowed = new Map<string, StartNote>();
  return {
    resolve: follow,
    unfollowed,
    targets(path, piece, framework, local) {
      const tree = piece.startTree;
      if (tree === undefined || framework === undefined || !START.has(framework))
        return (each) => each;
      const route = tree.routes && isStartRoute(framework, local);
      const drops = startDropsOf(tree.program, tree.kept, route, (source, name) =>
        follow(path, source, name),
      );
      const [page, server, maybe] = [drops.page, drops.server, drops.maybe].map(
        (each) => new Set(each),
      );
      const [name, from] = drops.through[0] ?? ["", ""];
      return (targets, specifier) => {
        const [off, on, may] = [page, server, maybe].map((each) => each?.has(specifier) === true);
        if (!off && !on && !may) return targets;
        const { files, loose } = targets;
        for (const file of may ? [...files, ...targets.page] : [])
          if (!unfollowed.has(file)) unfollowed.set(file, { file: path, name, from });
        return {
          ...targets,
          files: [],
          loose: [],
          page: off || may ? [] : [...files, ...targets.page],
          server: on ? [] : [...files, ...targets.server],
          pageLoose: off
            ? []
            : [...(may ? [...files, ...targets.page] : []), ...loose, ...targets.pageLoose],
          serverLoose: on ? [] : [...loose, ...targets.serverLoose],
        };
      };
    },
  };
}
