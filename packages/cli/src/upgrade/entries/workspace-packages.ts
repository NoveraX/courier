import { join } from "node:path";
import { type Project, readProject } from "@noverax/create-courier/engine";

import type { Workspace } from "../workspace";
import type { PackageFramework } from "./framework-roots";
import { type NuxtLayers, nuxtLayers } from "./nuxt-layers";
import { packageFramework } from "./package-framework";
import { viteRoots } from "./package-starts";
import { keepsTypeImports } from "./type-imports";

/** The packages of a workspace as the graph of imports reads them: where each file is, and each package's framework, tooling and name. */
export interface WorkspacePackages {
  /** The folder of the package a file is in, relative to the root: the deepest that holds it, `""` for the root's. */
  readonly packageOf: (path: string) => string;
  /** A package's project, for its tsconfig and package.json; `undefined` where its package.json does not read. */
  readonly projectOf: (dir: string) => Project | undefined;
  readonly frameworkOf: (dir: string) => PackageFramework;
  /** The packages by the name their package.json gives: their folders. */
  readonly members: ReadonlyMap<string, string>;
  /** The folders of the workspace's packages a package lists among its dependencies of any kind. */
  readonly dependenciesOf: (dir: string) => readonly string[];
  /** The framework whose rules a file is read by, and its path from the folder they read it from: its package's, or the Nuxt layer's it is in. */
  readonly placeOf: (path: string) => {
    readonly framework: PackageFramework;
    readonly local: string;
  };
  /** Each Nuxt config whose `extends` is not data, relative to the root. */
  readonly unreadLayers: () => readonly string[];
  /** Each config of a package's whose part that names where its code starts is not data, relative to the root, with what of it is not: an Expo app.config's. */
  readonly unreadConfigs: () => ReadonlyArray<{ readonly file: string; readonly what: string }>;
  /** Whether a package's tsconfig keeps an import of types named one by one as a load of its module. */
  readonly keepsTypeImports: (dir: string) => boolean;
  /** The folders a `/` in a package's code is read from, relative to the root: each Vite may take for the package's root. */
  readonly viteRoots: (dir: string) => readonly string[];
}

const NUXT: PackageFramework = { id: "nuxt" };
/**
 * A workspace's packages as the graph of imports reads them, each read
 * once: the package a file is in, its project — its tsconfig's aliases,
 * its package.json's `imports` — the framework its package.json lists,
 * with the route modules React Router's routes file names, Expo
 * Router's folder of routes and the app's `main`, and, for a page built
 * with Vite beside a server framework, the modules it starts from — and
 * the packages by their names. A package whose package.json does not read
 * has no framework the upgrade knows.
 *
 * @param workspace - The workspace
 * @returns Its packages
 * @example
 * ```ts
 * workspacePackages(workspaceOf("/work/shop")).frameworkOf("apps/web").id; // "next"
 * ```
 */
export function workspacePackages(workspace: Workspace): WorkspacePackages {
  const dirs = [...workspace.packages].sort((a, b) => b.length - a.length);
  const projects = new Map<string, Project | undefined>();
  const projectOf = (dir: string) => {
    if (!projects.has(dir)) {
      let project: Project | undefined;
      try {
        project = readProject(join(workspace.root, dir));
      } catch {
        project = undefined;
      }
      projects.set(dir, project);
    }
    return projects.get(dir);
  };
  const frameworks = new Map<string, PackageFramework>();
  const configs: Array<{ readonly file: string; readonly what: string }> = [];
  const frameworkOf = (dir: string) => {
    const known = frameworks.get(dir);
    if (known !== undefined) return known;
    const { framework, notes } = packageFramework(workspace.root, dir, projectOf(dir));
    configs.push(...notes);
    frameworks.set(dir, framework);
    return framework;
  };
  const members = new Map<string, string>();
  for (const dir of dirs) {
    const name = projectOf(dir)?.manifest.name;
    if (name !== undefined && !members.has(name)) members.set(name, dir);
  }
  const dependenciesOf = (dir: string) => {
    const manifest = projectOf(dir)?.manifest;
    if (manifest === undefined) return [];
    const { dependencies, devDependencies, peerDependencies, optionalDependencies } = manifest;
    const names = [dependencies, devDependencies, peerDependencies, optionalDependencies].flatMap(
      (listed) => Object.keys(listed),
    );
    return [...new Set(names.flatMap((name) => members.get(name) ?? []))];
  };
  /* The deepest package folder a path is under, by its own folders, the deepest first. */
  const folders = new Set(dirs);
  const packageOf = (path: string) => {
    for (let end = path.lastIndexOf("/"); end > 0; end = path.lastIndexOf("/", end - 1))
      if (folders.has(path.slice(0, end))) return path.slice(0, end);
    return "";
  };
  const keeps = new Map<string, boolean>();
  const roots = new Map<string, readonly string[]>();
  const rootsOf = (dir: string) => {
    const known = roots.get(dir);
    if (known !== undefined) return known;
    const project = projectOf(dir);
    const folders = project === undefined ? [""] : viteRoots(project);
    const found = folders.map((folder) => [dir, folder].filter((each) => each !== "").join("/"));
    roots.set(dir, found);
    return found;
  };
  let layers: NuxtLayers | undefined;
  const layersOf = () => {
    const apps = dirs.filter((dir) => frameworkOf(dir).id === "nuxt");
    layers ??= nuxtLayers(workspace.root, apps, members);
    return layers;
  };
  let deepest: string[] | undefined;
  const placeOf = (path: string) => {
    deepest ??= layersOf()
      .folders.filter((each) => each !== "")
      .sort((a, b) => b.length - a.length);
    const layer = deepest.find((each) => path.startsWith(`${each}/`));
    const dir = layer ?? packageOf(path);
    const local = dir === "" ? path : path.slice(dir.length + 1);
    return { framework: layer === undefined ? frameworkOf(dir) : NUXT, local };
  };
  return {
    packageOf,
    projectOf,
    frameworkOf,
    members,
    dependenciesOf,
    placeOf,
    unreadLayers: () => layersOf().unread,
    unreadConfigs: () => configs,
    keepsTypeImports: (dir) => {
      const known = keeps.get(dir) ?? keepsTypeImports(projectOf(dir));
      keeps.set(dir, known);
      return known;
    },
    viteRoots: rootsOf,
  };
}
