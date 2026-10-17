import { posix } from "node:path";

import { isRecord } from "../is-record";
import { projectCode } from "./project-code";
import type { Project } from "./read-project";
import { routeList, routeModule } from "./route-list";

const EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;
/* A path alias the project's tooling resolves: `@/`, `~/`, `~~/`, `#shared/`, `$lib/`, or a path from the root. */
const ALIAS = /^(?:@\/|@@\/|~~?\/|#|\$|src\/)/;
/* The files a server starts from where nothing names its entry: `src/index.ts`, `server.js`, `src/main.ts`. */
const ENTRY = /^(?:src\/)?(?:index|server|main|app)\.[cm]?[jt]s$/;
/* A file a script runs: `tsx watch src/index.ts`, `node dist/main.js`, `fastify start app.js`. */
const SCRIPT_FILE = /(?:^|[\s=])\.?\/?([\w@./-]+\.[cm]?[jt]sx?)(?=\s|$)/g;

/* The files each framework loads by itself, by the package that tells the framework. */
const LOADED_BY: ReadonlyArray<readonly [string, RegExp]> = [
  ["next", /^(?:src\/)?(?:instrumentation(?:-client)?|middleware)\.[cm]?[jt]s$/],
  ["next", /^(?:src\/)?(?:app\/(?:.+\/)?route\.[cm]?[jt]sx?|pages\/.+)$/],
  ["nuxt", /^server\/.+/],
  ["@sveltejs/kit", /^src\/(?:hooks\.server\.[cm]?[jt]s|routes\/.+)$/],
  ["astro", /^src\/(?:middleware(?:\/index)?\.[cm]?[jt]s|pages\/.+)$/],
  ["@remix-run/dev", /^app\/routes\/.+/],
  ["@solidjs/start", /^src\/routes\/.+/],
  ["@fastify/autoload", /^(?:src\/)?(?:plugins|routes)\/.+/],
];

const cache = new WeakMap<Project, Set<string>>();

/* A path as an alias may name it: its last two segments. */
function aliasKey(path: string): string {
  return `alias:${path.split("/").slice(-2).join("/")}`;
}

/* The files the project's code loads, by their path without extension: each relative import, and each alias by its last two segments. */
function importedBy(project: Project): Set<string> {
  const known = cache.get(project);
  if (known) return known;
  const loaded = new Set<string>();
  for (const file of projectCode(project)) {
    for (const { specifier } of file.imports) {
      const bare = specifier.replace(EXTENSION, "");
      if (bare.startsWith(".")) {
        const path = posix.normalize(posix.join(posix.dirname(file.path), bare));
        loaded.add(path).add(`${path}/index`);
      } else if (ALIAS.test(bare)) loaded.add(aliasKey(bare.replace(/^(?:@@?|~~?)\//, "")));
    }
  }
  cache.set(project, loaded);
  return loaded;
}

/* What package.json starts: its `main`, `module` and `bin`, and the files its scripts run — a build's output read as the source it is built from. */
function entriesOf(project: Project): Set<string> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(project.read("package.json") ?? "{}");
  } catch {
    manifest = {};
  }
  const record = isRecord(manifest) ? manifest : {};
  const bin = isRecord(record.bin) ? Object.values(record.bin) : [record.bin];
  const named = [record.main, record.module, ...bin].filter((each) => typeof each === "string");
  const run = Object.values(project.manifest.scripts).flatMap((script) =>
    [...script.matchAll(SCRIPT_FILE)].map((match) => match[1] ?? ""),
  );
  return new Set(
    [...named, ...run].flatMap((file) => {
      const bare = posix.normalize(file.replace(/^\.\//, "")).replace(EXTENSION, "");
      return [bare, bare.replace(/^(?:dist|build|out|lib)\//, "src/")];
    }),
  );
}

/* Whether React Router's routes file lists a route module, however it writes the path, or reads the routes from the folder. */
function listedRoute(project: Project, path: string): boolean {
  const text = project.read("app/routes.ts") ?? project.read("app/routes.js");
  if (text === undefined) return true;
  const list = routeList(text);
  if (list === undefined) return false;
  return list.fromFolder || list.modules.has(routeModule(path.replace(/^app\//, "")));
}

/**
 * Whether anything loads a file of the project's: the framework, by its
 * place — Next.js's instrumentation, Nuxt's `server/`, SvelteKit's hooks,
 * a page or a route — the project's package.json, as its entry or a file a
 * script runs, or another file of its code, which imports it. A file that
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
  if (byFramework || ENTRY.test(path) || entriesOf(project).has(bare)) return true;
  const imported = importedBy(project);
  return imported.has(bare) || imported.has(aliasKey(bare));
}
