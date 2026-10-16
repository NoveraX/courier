import { importSpecifier } from "../import-specifier";
import type { ManualStep, RecipeContext, RecipeEdit, RecipeFile } from "../recipe-types";
import { configPathOf } from "./courier-config";
import { wantsRoutes } from "./wants-routes";

/** What a recipe's wiring adds: a file of its own, a change to one of the project's, or a step left to the person. */
export type RecipePart = RecipeFile | RecipeEdit | ManualStep;

/**
 * A recipe's parts, sorted into its files, its edits and its steps.
 *
 * @param parts - The parts
 * @returns The three lists
 * @example
 * ```ts
 * const { files, edits, manual } = sortParts([hooks, viteStudioEdit(project, "sveltekit")]);
 * ```
 */
export function sortParts(parts: readonly RecipePart[]): {
  files: RecipeFile[];
  edits: RecipeEdit[];
  manual: ManualStep[];
} {
  return {
    files: parts.filter((part): part is RecipeFile => "content" in part),
    edits: parts.filter((part): part is RecipeEdit => "change" in part),
    manual: parts.filter((part): part is ManualStep => "what" in part),
  };
}

/**
 * The script that starts Studio, where it is set up.
 *
 * @param ctx - The project, and what is set up in it
 * @returns `{ studio: "courier-studio" }`, or nothing
 * @example
 * ```ts
 * studioScripts(ctx); // { studio: "courier-studio" }
 * ```
 */
export function studioScripts(ctx: RecipeContext): Record<string, string> {
  return ctx.choices.studio ? { studio: STUDIO_COMMAND } : {};
}

/** The command of the `studio` script a setup with Studio adds. */
export const STUDIO_COMMAND = "courier-studio";

/** The command of the `routes` script a setup whose pages call through the proxy adds. */
export const ROUTES_COMMAND = "courier-cli routes";

/**
 * The scripts of a setup whose pages call the API through the proxy:
 * Studio's, where it is set up, and — where the project has routes to
 * write — `routes`, which writes `courier.routes.ts` again from the
 * `.expose()` marks and, given `--check`, fails a CI job where the file is
 * not what they give.
 *
 * @param ctx - The project, and what is set up in it
 * @returns The scripts, by name
 * @example
 * ```ts
 * proxyScripts(ctx); // { studio: "courier-studio", routes: "courier-cli routes" }
 * ```
 */
export function proxyScripts(ctx: RecipeContext): Record<string, string> {
  return { ...studioScripts(ctx), ...(wantsRoutes(ctx) ? { routes: ROUTES_COMMAND } : {}) };
}

/**
 * The code that connects a server to Studio while you develop: the
 * runtime is imported only then, so a production build leaves it out.
 *
 * @param condition - The expression that is true while you develop
 * @param indent - The indentation the lines take
 * @returns The lines, as one string
 * @example
 * ```ts
 * studioAttach("import.meta.env.DEV", "");
 * ```
 */
export function studioAttach(condition: string, indent: string): string {
  return [
    `if (${condition}) {`,
    `  const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");`,
    "  await attachRuntime();",
    "}",
  ]
    .map((line) => `${indent}${line}`)
    .join("\n");
}

/**
 * A module that starts Courier on a server as it loads — SvelteKit's
 * hooks, Astro's middleware — with the parts still missing: the config's
 * APIs registered, and the server connected to Studio while you develop.
 *
 * @param ctx - The project, and what is set up in it
 * @param path - The module, relative to the root
 * @param needs - What is missing
 * @param serves - What serves the APIs, for the comment
 * @returns The module's code, up to where the framework's own exports go
 * @example
 * ```ts
 * registerModule(ctx, "src/hooks.server.ts", { register: true, studio: true }, "the /api/request route serves");
 * ```
 */
export function registerModule(
  ctx: RecipeContext,
  path: string,
  needs: { readonly register: boolean; readonly studio: boolean },
  serves: string,
): string {
  const studio = needs.studio ? studioAttach("import.meta.env.DEV", "") : "";
  if (!needs.register)
    return `/* While you develop, the server's calls show in Courier Studio. */\n${studio}\n`;
  return `import { registerSources } from "@noverax/courier";

import config from "${importSpecifier(path, configPathOf(ctx), ctx.extension)}";

/* The APIs courier.config.ts lists, which ${serves}${needs.studio ? ";\n   while you develop, the server's calls show in Courier Studio" : ""}. */
registerSources(config.sources);${needs.studio ? `\n\n${studio}` : ""}
`;
}
