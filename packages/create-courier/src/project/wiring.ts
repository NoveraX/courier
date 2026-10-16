import { destructured, type ModuleImport, usesExport, usesOf } from "../edit/imports";
import { namePattern } from "../edit/regex-text";
import { codeMatches, nextCode } from "../edit/source-scan";
import { configObjectPath } from "./config-file";
import { isLoaded } from "./loaded-files";
import { loadsFile } from "./module-target";
import { type CodeFile, projectCode } from "./project-code";
import type { Project } from "./read-project";

const EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;
/* Files only a browser runs: a server's connection to Studio is never made there. */
const CLIENT = /(?:^|\/)(?:instrumentation-client|[^/]*\.client)\.[^/]+$/;

const CORE = (specifier: string) => specifier === "@noverax/courier";
const RUNTIME = (specifier: string) =>
  /^@noverax\/courier-studio-core(?:\/runtime)?$/.test(specifier);

/** Whether a file's specifier loads the config's list. */
type NamesConfig = (from: string, specifier: string) => boolean;

/* The modules that give the config's list — courier.config, and the module it passes it on from — however a file names them. */
function configModules(project: Project): NamesConfig {
  const modules = [
    ...new Set(["courier.config", configObjectPath(project).replace(EXTENSION, "")]),
  ];
  return (from, specifier) => modules.some((module) => loadsFile(project, from, specifier, module));
}

/* A name as a pattern that matches it alone. */
function exactly(name: string): string {
  return `${namePattern(name)}(?![\\w$])`;
}

/* The names a file holds the config's list under: the config imported, or its `sources` destructured from it. */
function configNames(file: CodeFile, modules: NamesConfig): { configs: string[]; lists: string[] } {
  const configs = file.imports
    .filter((each) => modules(file.path, each.specifier))
    .flatMap((each) => each.bindings)
    .filter((binding) => binding.imported === "default" || binding.imported === "*")
    .map((binding) => binding.local);
  const lists = configs.flatMap((config) =>
    codeMatches(
      file.scan,
      new RegExp(`\\b(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${exactly(config)}`, "g"),
    )
      .flatMap((match) => destructured(match[1] ?? ""))
      .filter((binding) => binding.imported === "sources")
      .map((binding) => binding.local),
  );
  return { configs, lists };
}

/* Whether `registerSources(…)` is given the config's list: `config.sources`, or `sources` destructured from it. */
function registersList(
  file: CodeFile,
  modules: NamesConfig,
  imports: readonly ModuleImport[],
): boolean {
  const { configs, lists } = configNames(file, modules);
  if (configs.length === 0) return false;
  const register = imports
    .filter((each) => CORE(each.specifier))
    .flatMap((each) => each.bindings)
    .flatMap((binding) =>
      binding.imported === "registerSources"
        ? [binding.local]
        : binding.imported === "*"
          ? [`${binding.local}.registerSources`]
          : [],
    );
  return register.some((name) =>
    usesOf(file.scan, imports, name, true).some((at) => {
      const open = file.scan.text.indexOf("(", at);
      const argument = file.scan.text.slice(nextCode(file.scan, open + 1));
      return (
        configs.some(
          (config) =>
            new RegExp(`^${exactly(`${config}.sources`)}`).test(argument) ||
            new RegExp(`^${exactly(`${config}.default.sources`)}`).test(argument),
        ) || lists.some((list) => new RegExp(`^${exactly(list)}`).test(argument))
      );
    }),
  );
}

/**
 * The file that registers the APIs the config lists — `registerSources`
 * called with the config's `sources` — as the server starts: one that
 * something loads, else it never runs.
 *
 * @param project - The project
 * @param loading - A file to count as loaded: one the setup is about to have loaded
 * @returns Its path, or `undefined` where no file does
 * @example
 * ```ts
 * registeringFile(project); // "instrumentation.ts"
 * ```
 */
export function registeringFile(project: Project, loading?: string): string | undefined {
  const modules = configModules(project);
  return projectCode(project).find(
    (file) =>
      registersList(file, modules, file.imports) &&
      (file.path === loading || isLoaded(project, file.path)),
  )?.path;
}

/**
 * The file of the server's that connects it to Studio: `attachRuntime`
 * from Studio's runtime, called outside a file only the browser runs, in
 * a file something loads.
 *
 * @param project - The project
 * @param loading - A file to count as loaded: one the setup is about to have loaded
 * @returns Its path, or `undefined` where no file does
 * @example
 * ```ts
 * studioServerFile(project); // "src/hooks.server.ts"
 * ```
 */
export function studioServerFile(project: Project, loading?: string): string | undefined {
  return projectCode(project).find(
    (file) =>
      !CLIENT.test(file.path) &&
      usesExport(file.scan, file.imports, RUNTIME, "attachRuntime", true) &&
      (file.path === loading || isLoaded(project, file.path)),
  )?.path;
}

/** A file of the project's that does a part of Courier's, and whether anything loads it. */
export interface FoundFile {
  readonly path: string;
  readonly loaded: boolean;
}

/**
 * The file that uses an export of a framework's Courier package — the
 * proxy route's handler, its plugin or its middleware — one that something
 * loads where there is one.
 *
 * @param project - The project
 * @param module - The package: `@noverax/courier-next`
 * @param exported - The export: `apiRoute`
 * @param call - Whether only a call counts; Fastify's plugin is passed, not called
 * @returns The file, or `undefined` where no file uses it
 * @example
 * ```ts
 * fileUsing(project, "@noverax/courier-next", "apiRoute", true); // { path: "app/api/request/route.ts", loaded: true }
 * ```
 */
export function fileUsing(
  project: Project,
  module: string,
  exported: string,
  call = true,
): FoundFile | undefined {
  const found = projectCode(project)
    .filter((file) =>
      usesExport(file.scan, file.imports, (specifier) => specifier === module, exported, call),
    )
    .map((file) => ({ path: file.path, loaded: isLoaded(project, file.path) }));
  return found.find((file) => file.loaded) ?? found[0];
}

/**
 * Whether a file calls Studio's `attachRuntime`: the browser's connection
 * a Next.js app makes from `instrumentation-client.ts`.
 *
 * @param project - The project
 * @param path - The file
 * @returns Whether it does
 * @example
 * ```ts
 * attachesStudio(project, "instrumentation-client.ts"); // true
 * ```
 */
export function attachesStudio(project: Project, path: string): boolean {
  const file = projectCode(project).find((each) => each.path === path);
  return file !== undefined && usesExport(file.scan, file.imports, RUNTIME, "attachRuntime", true);
}
