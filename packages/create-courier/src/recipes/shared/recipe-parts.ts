import type { ManualStep, RecipeContext, RecipeEdit, RecipeFile } from "../recipe-types";

/** What a recipe's wiring adds: a file of its own, a change to one of the project's, or a step left to the person. */
export type RecipePart = RecipeFile | RecipeEdit | ManualStep;

/**
 * A file of Courier's own, or — where the project has a file of that
 * name, or of one it takes in its place — the lines to add to it, for the
 * person.
 *
 * @param ctx - The project, and what is set up in it
 * @param file - The file
 * @param what - What its lines do, for the step left to the person
 * @param others - Other names the project may have it under: `.js`, another folder
 * @returns The file, or the step
 * @example
 * ```ts
 * ownOrManual(ctx, hooks, "Register Courier's APIs as the server starts", ["src/hooks.server.js"]);
 * ```
 */
export function ownOrManual(
  ctx: RecipeContext,
  file: RecipeFile,
  what: string,
  others: readonly string[] = [],
): RecipeFile | ManualStep {
  const taken = [file.path, ...others].find((path) => ctx.project.exists(path));
  return taken === undefined
    ? file
    : { file: taken, what, lines: file.content.trimEnd().split("\n") };
}

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
  return ctx.choices.studio ? { studio: "courier-studio" } : {};
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
