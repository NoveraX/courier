import { autoloadFolders, entryFiles } from "./entry-files";
import { tailKey, targetsOf } from "./module-target";
import { projectCode } from "./project-code";
import type { Project } from "./read-project";
import { routeList, routeModule } from "./route-list";

const EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;
/* The files a server starts from where nothing names its entry: `src/index.ts`, `server.js`, `src/main.ts`. */
const ENTRY = /^(?:src\/)?(?:index|server|main|app)\.[cm]?[jt]s$/;
/* The modules React Router and Remix load around the routes: the root, and the entries. */
const APP_MODULES = /^app\/(?:root|entry\.(?:server|client))\.[cm]?[jt]sx?$/;

/* The files each framework loads by itself, by the package that tells the framework. */
const LOADED_BY: ReadonlyArray<readonly [string, RegExp]> = [
  ["next", /^(?:src\/)?(?:instrumentation(?:-client)?|middleware)\.[cm]?[jt]s$/],
  ["next", /^(?:src\/)?(?:app\/(?:.+\/)?route\.[cm]?[jt]sx?|pages\/.+)$/],
  ["nuxt", /^server\/.+/],
  ["@sveltejs/kit", /^src\/(?:hooks\.server\.[cm]?[jt]s|routes\/.+)$/],
  ["astro", /^src\/(?:middleware(?:\/index)?\.[cm]?[jt]s|pages\/.+)$/],
  ["@remix-run/dev", /^app\/routes\/.+/],
  ["@remix-run/dev", APP_MODULES],
  ["@react-router/dev", APP_MODULES],
  ["@solidjs/start", /^src\/routes\/.+/],
  ["@fastify/autoload", /^(?:src\/)?(?:plugins|routes)\/.+/],
];

const cache = new WeakMap<Project, Set<string>>();

/* The files the project's code loads, by their path without extension, and by the key of a framework's alias. */
function importedBy(project: Project): Set<string> {
  const known = cache.get(project);
  if (known) return known;
  const loaded = new Set<string>();
  for (const file of projectCode(project)) {
    for (const { specifier } of file.imports) {
      for (const target of targetsOf(project, file.path, specifier)) loaded.add(target);
    }
  }
  cache.set(project, loaded);
  return loaded;
}

/* Whether React Router's routes file lists a route module, or reads the routes from the folder. */
function listedRoute(project: Project, path: string): boolean {
  const text = project.read("app/routes.ts") ?? project.read("app/routes.js");
  if (text === undefined) return true;
  const list = routeList(text);
  if (list === undefined) return false;
  return list.fromFolder || list.modules.has(routeModule(path.replace(/^app\//, "")));
}

/* Whether Fastify's autoload registers the file, from a folder its code names. */
function autoloaded(project: Project, path: string): boolean {
  if (!project.lists("@fastify/autoload")) return false;
  return autoloadFolders(project).some((folder) => path.startsWith(`${folder}/`));
}
/**
 * Whether anything loads a file of the project's: the framework, by its
 * place — Next.js's instrumentation, Nuxt's `server/`, SvelteKit's hooks,
 * a page or a route, the folder Fastify's autoload reads — the project's
 * package.json or wrangler config, as its entry or a file a script runs,
 * or another file of its code, which imports it — by a relative path or
 * by one of the project's aliases. A file that
 * does Courier's part where nothing loads it does not do it.
 *
 * @param project - The project
 * @param path - The file, relative to the root
 * @returns Whether it is loaded
 * @example
 * ```ts
 * isLoaded(project, "lib/boot.ts"); // false where no file imports it
 * ```
 */
export function isLoaded(project: Project, path: string): boolean {
  const bare = path.replace(EXTENSION, "");
  if (project.lists("@react-router/dev") && path.startsWith("app/routes/")) {
    return listedRoute(project, path);
  }
  const byFramework = LOADED_BY.some(
    ([marker, pattern]) => project.lists(marker) && pattern.test(path),
  );
  if (byFramework || autoloaded(project, path)) return true;
  if (ENTRY.test(path) || entryFiles(project).has(bare)) return true;
  const imported = importedBy(project);
  return imported.has(bare) || imported.has(tailKey(bare));
}
