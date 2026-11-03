import { basename, relative, sep } from "node:path";
import { type RoutesProject, routesLoaderFile } from "@noverax/courier-build/webpack";

import type { NextVersion } from "./next-version";

/**
 * The module `@noverax/courier/routes` ships, wherever a package manager
 * installs it: a glob with a slash matches the path from the project's root.
 */
const INSTALLED_STUB = "**/node_modules/@noverax/courier/lib/routes/index.js";

/** A rule of Turbopack's: the loaders it runs on what its glob matches, and what they give. */
interface TurbopackRule {
  loaders: Array<{ loader: string; options: Record<string, string> }>;
  as: string;
  condition?: string;
}

/**
 * The rules that have Turbopack build the routes in place of the module
 * `@noverax/courier/routes` ships, and fail a page's bundle that takes the
 * config itself, by their globs. A page's bundle is named by a condition:
 * written inside the rule from Next.js 16, as the rule's key before it.
 *
 * @param project - The project, as `routesProject()` gives it
 * @param version - The Next.js the project builds with
 * @returns The rules, by glob
 * @example
 * ```ts
 * turbopackRoutesRules(project, { major: 16, minor: 2 }); // { "**\/node_modules/@noverax/courier/lib/routes/index.js": { … } }
 * ```
 */
export function turbopackRoutesRules(
  project: RoutesProject,
  version: NextVersion,
): Record<string, unknown> {
  const loader = routesLoaderFile();
  const routes: TurbopackRule = { loaders: [{ loader, options: optionsOf(project) }], as: "*.js" };
  const rules: Record<string, unknown> = { [INSTALLED_STUB]: routes };
  const linked = withinRoot(project.root, project.stubFile);
  if (linked !== undefined && !linked.split("/").includes("node_modules")) rules[linked] = routes;
  if (project.configFile === undefined) return rules;
  const refusal: TurbopackRule = {
    loaders: [{ loader, options: { ...optionsOf(project), refuse: "config-in-page" } }],
    as: "*.js",
  };
  const config = withinRoot(project.root, project.configFile) ?? basename(project.configFile);
  rules[config] = version.major >= 16 ? { ...refusal, condition: "browser" } : { browser: refusal };
  return rules;
}

/* What the loader is told, as JSON alone: Turbopack takes no key left undefined. */
function optionsOf(project: RoutesProject): Record<string, string> {
  return project.config === undefined
    ? { root: project.root }
    : { root: project.root, config: project.config };
}

/* The path of a file from the root, with slashes, when it lies inside it. */
function withinRoot(root: string, file: string): string | undefined {
  const path = relative(root, file);
  if (path === "" || path.startsWith("..") || path.includes(":")) return undefined;
  return path.split(sep).join("/");
}
