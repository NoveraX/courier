import { posix, relative, sep } from "node:path";
import { aliasTargets, type Project } from "@noverax/create-courier/engine";

import { type ProbeIn, probe, probeUnread } from "./file-probe";
import type { PackageFrameworkId } from "./framework-roots";
import { importEntry, packageEntry } from "./package-entries";
import { byQuery, withoutQuery } from "./vite-queries";

/** Where a specifier leads from a file: the files it names, and what it may load. */
export interface Targets {
  /** The files it names, as the project's tooling resolves it. */
  readonly files: readonly string[];
  /** The files it names for one side alone: what a package.json import or a package's exports give a page's conditions, and the server's. */
  readonly page: readonly string[];
  readonly server: readonly string[];
  /** Files it may name: an alias nothing resolves, read by the last segments of its path. */
  readonly loose: readonly string[];
  /** Files it may name for one side alone: what any condition a page may match gives, and a server. */
  readonly pageLoose: readonly string[];
  readonly serverLoose: readonly string[];
  /** Packages of the workspace it names by their name whose entry leads to no code the walk read: any of their files may be what it loads. */
  readonly packages: readonly string[];
  /** The files and folders the graph could not read that it names: what they load is not known. */
  readonly unread: readonly number[];
}

/** What resolving reads of the workspace: its files of code, its packages and their tooling. */
export interface ResolveIn extends ProbeIn {
  /** The workspace's folder. */
  readonly root: string;
  /** The folder of the package a file is in, relative to the root: `""` for the root's. */
  readonly packageOf: (path: string) => string;
  readonly projectOf: (dir: string) => Project | undefined;
  readonly frameworkOf: (dir: string) => PackageFrameworkId | undefined;
  /** The workspace's packages by name: their folders. */
  readonly members: ReadonlyMap<string, string>;
  /** The folders a `/` in a package's code is read from, relative to the root. */
  readonly viteRoots: (dir: string) => readonly string[];
}

const ALIAS_LOOK = /^(?:@\/|@@\/|~|#|\$|src\/)/;
const PACKAGE = /^((?:@[^/]+\/)?[^/]+)/;
const NONE: Targets = {
  files: [],
  page: [],
  server: [],
  loose: [],
  pageLoose: [],
  serverLoose: [],
  packages: [],
  unread: [],
};

function join(dir: string, path: string): string {
  return posix.normalize(dir === "" ? path : `${dir}/${path}`);
}

/* A framework's own aliases, where its tooling gives them without the tsconfig: Nuxt's `~` and `#shared`, SvelteKit's `$lib`. */
function frameworkBases(
  framework: PackageFrameworkId | undefined,
  dir: string,
  specifier: string,
): string[] {
  const rest = (prefix: string) => specifier.slice(prefix.length);
  if (framework === "nuxt") {
    if (/^(?:~~|@@)\//.test(specifier)) return [join(dir, rest("~~/"))];
    if (/^[~@]\//.test(specifier)) return [join(dir, `app/${rest("~/")}`), join(dir, rest("~/"))];
    if (specifier.startsWith("#shared/")) return [join(dir, `shared/${rest("#shared/")}`)];
  }
  if (framework === "sveltekit" && /^\$lib(?:\/|$)/.test(specifier))
    return [join(dir, `src/lib${rest("$lib")}`)];
  return [];
}

/**
 * The paths a specifier names, each without its extension: relative to
 * its file, from each folder Vite may take for its package's root, or by
 * an alias of the package's tsconfig or framework.
 *
 * @param input - The workspace, as the resolver reads it
 * @param from - The file that names it, relative to the root
 * @param specifier - The specifier
 * @returns The paths, relative to the root; none where nothing names one
 * @example
 * ```ts
 * basesOf(input, "src/main.tsx", "@/pages"); // ["src/pages"] where paths maps "@/*" to "./src/*"
 * ```
 */
export function basesOf(input: ResolveIn, from: string, specifier: string): string[] {
  const dir = input.packageOf(from);
  if (specifier.startsWith(".")) return [join(posix.dirname(from), specifier)];
  if (specifier.startsWith("/"))
    return input.viteRoots(dir).map((root) => join(root, specifier.slice(1)));
  const project = input.projectOf(dir);
  const aliased = (project === undefined ? [] : aliasTargets(project, specifier))
    .map((target) => relative(input.root, target).split(sep).join("/"))
    .filter((target) => target !== "" && !target.startsWith(".."));
  return [...aliased, ...frameworkBases(input.frameworkOf(dir), dir, specifier)];
}

/* The files of code the walk read that paths without their extension name, each once. */
function readAll(input: ResolveIn, paths: readonly string[]): string[] {
  return [...new Set(paths.flatMap((path) => probe(input, path) ?? []))];
}

/* Where an import of a workspace's package by its name leads: the files its entries give each side, and the package whole where an entry leads to no code the walk read, as a build's output. */
function byName(input: ResolveIn, member: string, subpath: string): Targets {
  const entry = packageEntry(input.projectOf(member), member, subpath);
  const [page, server] = [readAll(input, entry.page), readAll(input, entry.server)];
  const followed = page.length === entry.page.length && server.length === entry.server.length;
  const [pageLoose, serverLoose] = [readAll(input, entry.pageMay), readAll(input, entry.serverMay)];
  return { ...NONE, page, server, pageLoose, serverLoose, packages: followed ? [] : [member] };
}

/* Where a package.json import leads from a package's file: the files its conditions give each side, or what the graph could not read among them; none where no key matches, or its paths name nothing the walk met. */
function byImport(input: ResolveIn, dir: string, specifier: string): Targets | undefined {
  const entry = importEntry(input.projectOf(dir), dir, specifier);
  if (entry === undefined) return undefined;
  const [pageLoose, serverLoose] = [readAll(input, entry.pageMay), readAll(input, entry.serverMay)];
  if (pageLoose.length > 0 || serverLoose.length > 0) {
    const [page, server] = [readAll(input, entry.page), readAll(input, entry.server)];
    return { ...NONE, page, server, pageLoose, serverLoose };
  }
  const paths = [...entry.pageMay, ...entry.serverMay];
  const unread = [...new Set(paths.flatMap((path) => probeUnread(input, path) ?? []))];
  return unread.length > 0 ? { ...NONE, unread } : undefined;
}

/**
 * The resolver of the workspace's imports, which never reads
 * `node_modules`: a relative specifier, one from a package's root, and
 * an alias of its tsconfig `paths` or `baseUrl` — through what the
 * tsconfig extends, to any package of the workspace — or of its
 * framework name files for certain. A package.json `imports` key, and a
 * package of the workspace named by its name, load the file their
 * conditions give each side, and may load any other they give; a package
 * whose entry leads to no file the walk read may load any of its files,
 * and an alias nothing resolves a file by the last segments of its path.
 * Any other package's name loads nothing the upgrade reads. A query is
 * read as Vite reads it: a worker's loads the file's code, an address
 * may load it, a text loads nothing.
 *
 * @param input - The workspace, as the resolver reads it
 * @returns The resolver: from a file and a specifier, where it leads
 * @example
 * ```ts
 * resolverOf(input)("src/app/page.tsx", "@/lib/api").files; // ["src/lib/api.ts"]
 * ```
 */
export function resolverOf(input: ResolveIn): (from: string, specifier: string) => Targets {
  const { paths } = input;
  const tails = new Map<string, string[]>();
  for (const path of paths) {
    const key = path
      .replace(/(?:\/index)?\.[^./]+$/, "")
      .split("/")
      .slice(-2)
      .join("/");
    tails.set(key, [...(tails.get(key) ?? []), path]);
  }
  /* Each package's entries, read once for each subpath its imports name. */
  const entries = new Map<string, Targets>();
  const entryOf = (member: string, subpath: string) => {
    const key = `${member}\0${subpath}`;
    const known = entries.get(key) ?? byName(input, member, subpath);
    entries.set(key, known);
    return known;
  };
  /* Each package's imports keys, read once for each its files name. */
  const imported = new Map<string, Targets | undefined>();
  const importOf = (dir: string, specifier: string) => {
    const key = `${dir}\0${specifier}`;
    if (!imported.has(key)) imported.set(key, byImport(input, dir, specifier));
    return imported.get(key);
  };
  const resolve = (from: string, specifier: string): Targets => {
    const conditional = specifier.startsWith("#")
      ? importOf(input.packageOf(from), specifier)
      : undefined;
    if (conditional !== undefined) return conditional;
    const bases = basesOf(input, from, specifier);
    const files = [...new Set(bases.flatMap((base) => probe(input, base) ?? []))];
    const unread =
      files.length > 0 ? [] : [...new Set(bases.flatMap((base) => probeUnread(input, base) ?? []))];
    if (files.length > 0 || unread.length > 0 || specifier.startsWith("."))
      return { ...NONE, files, unread };
    const name = PACKAGE.exec(specifier)?.[1] ?? "";
    const member = input.members.get(name);
    if (member !== undefined) return entryOf(member, `.${specifier.slice(name.length)}`);
    if (!ALIAS_LOOK.test(specifier)) return NONE;
    const key = specifier
      .replace(/^(?:@@?|~~?|#|\$)\/?/, "")
      .split("/")
      .slice(-2)
      .join("/");
    return { ...NONE, loose: tails.get(key) ?? [] };
  };
  return (from, written) => {
    const { path, loads } = withoutQuery(written);
    return byQuery(resolve(from, path), loads);
  };
}
