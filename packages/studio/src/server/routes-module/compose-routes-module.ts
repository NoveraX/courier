import { basename, dirname, extname, join, relative, sep } from "node:path";
import type { CourierConfig } from "@noverax/courier/config";
import { routesOf } from "@noverax/courier/internal";

import { writesExplicitExtensions } from "../mocks-edit/writes-explicit-extensions";
import { nameRoutes } from "./name-routes";
import { routesModuleText } from "./routes-module-text";

/* The extension a TypeScript file runs as, which an import that names it carries under Node's resolution. */
const RUNS_AS: Readonly<Record<string, string>> = { ".ts": ".js", ".mts": ".mjs", ".cts": ".cjs" };

/** A routes module, as Studio composed it from a config that loaded. */
export interface ComposedRoutesModule {
  /** Its path from the project root, with `/` separators. */
  path: string;
  /** Its text, before the project's formatters see it. */
  content: string;
  /** The sources a page may call an endpoint of, by name. */
  sources: string[];
  /** How many endpoints a page may call, of every source. */
  endpoints: number;
}

/** A composed routes module, or why there is none. */
export type RoutesComposition =
  | { module: ComposedRoutesModule; problem: null }
  | { module: null; problem: string };

/**
 * Compose a project's routes module from its config as it loaded: each
 * source with an endpoint a page may call, in the order their names sort,
 * by the rules the proxy applies. A TypeScript module beside a TypeScript
 * config imports the config's type, by a path written as the project
 * writes its relative imports; any other carries no types.
 *
 * @param root - The project root, symlinks resolved
 * @param loaded - The config, and the file it loaded from
 * @param path - Where the module goes, from the root, with `/` separators
 * @returns The module, or why it cannot be written: two sources that would export one name
 * @example
 * ```ts
 * composeRoutesModule(root, await loadCourierConfig(root), "courier.routes.ts").module?.endpoints; // → 12
 * ```
 */
export function composeRoutesModule(
  root: string,
  loaded: { config: CourierConfig; configFile: string },
  path: string,
): RoutesComposition {
  const { config, configFile } = loaded;
  const names = Object.keys(config.sources).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const routes = names
    .map((name) => routesOf(config.sources[name] as object, name))
    .filter((each) => Object.keys(each.endpoints).length > 0);
  const naming = nameRoutes(routes);
  if (naming.problem !== null) return { module: null, problem: naming.problem };
  const content = routesModuleText({
    configName: basename(configFile),
    sources: naming.named,
    configSpecifier: configSpecifierFor(root, path, configFile),
  });
  const endpoints = routes.reduce((sum, each) => sum + Object.keys(each.endpoints).length, 0);
  return {
    module: { path, content, sources: routes.map((each) => each.source), endpoints },
    problem: null,
  };
}

/* A module and a config that are both TypeScript carry the types; the import names the
   config without its extension, or with the one it runs as where the project writes it so. */
function configSpecifierFor(root: string, path: string, configFile: string): string | undefined {
  const runsAs = RUNS_AS[extname(configFile)];
  if (runsAs === undefined || !(path.endsWith(".ts") || path.endsWith(".mts"))) return undefined;
  /* From the config's own folder, the root as the loader resolved it, so a link on the way is not counted twice. */
  const from = dirname(join(dirname(configFile), path));
  const relativePath = relative(from, configFile).split(sep).join("/");
  const bare = relativePath.slice(0, -extname(relativePath).length);
  const specifier = bare.startsWith("../") ? bare : `./${bare}`;
  return writesExplicitExtensions(root, path, basename(configFile))
    ? `${specifier}${runsAs}`
    : specifier;
}
