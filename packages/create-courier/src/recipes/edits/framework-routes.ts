import type { FrameworkId } from "../../frameworks";
import type { Project } from "../../project/read-project";
import type { ManualStep, RecipeEdit } from "../recipe-types";
import { nextRoutesEdit } from "./next-routes";
import { astroRoutesEdit, nuxtRoutesEdit, viteRoutesEdit } from "./routes-plugin";

/** A framework Courier's plugin builds the pages' routes in for. */
export type RoutesFramework = Extract<
  FrameworkId,
  "next" | "nuxt" | "sveltekit" | "astro" | "react-router" | "remix" | "solid-start"
>;

/** The frameworks Courier's plugin builds the pages' routes in for. */
export const ROUTES_FRAMEWORKS: readonly RoutesFramework[] = [
  "next",
  "nuxt",
  "sveltekit",
  "astro",
  "react-router",
  "remix",
  "solid-start",
];

/**
 * Whether Courier's plugin builds a framework's routes in: the setup adds
 * it, unless the project keeps `courier.routes.ts` or `--routes file`
 * asks for the file.
 *
 * @param id - The framework
 * @returns Whether it does
 * @example
 * ```ts
 * isRoutesFramework("express"); // false
 * ```
 */
export function isRoutesFramework(id: FrameworkId): id is RoutesFramework {
  return ROUTES_FRAMEWORKS.some((each) => each === id);
}

/**
 * A plugin for a SolidStart app's Vite: the edit of `vite.config` — or,
 * where SolidStart 1 keeps Vite's plugins in `app.config.ts`, under
 * `vite`, which the command does not change, the step that names it there,
 * unless the config lists it already.
 *
 * @param project - The project
 * @param edit - The edit of `vite.config`
 * @param what - What the step asks of the person
 * @returns The edit, the step, or nothing
 * @example
 * ```ts
 * solidStartPlugin(project, viteStudioEdit(project, "solid"), "Connect the browser to Studio: …");
 * ```
 */
export function solidStartPlugin(
  project: Project,
  edit: RecipeEdit,
  what: string,
): RecipeEdit | ManualStep | undefined {
  const text = project.read("app.config.ts");
  if (text === undefined) return edit;
  if (edit.change(text) === text) return undefined;
  return { ...edit.manual, file: "app.config.ts", what };
}

/**
 * Where a framework's build takes Courier's plugin: the edit that adds it
 * to the build's config, the step that names it where the command does not
 * change that config, or nothing where the config lists it already.
 *
 * @param project - The project
 * @param id - The framework
 * @returns The edit, the step, or nothing
 * @example
 * ```ts
 * routesPluginOf(project, "sveltekit")?.path; // "vite.config.ts"
 * ```
 */
export function routesPluginOf(
  project: Project,
  id: RoutesFramework,
): RecipeEdit | ManualStep | undefined {
  switch (id) {
    case "next":
      return nextRoutesEdit(project);
    case "nuxt":
      return nuxtRoutesEdit(project);
    case "astro":
      return astroRoutesEdit(project);
    case "sveltekit":
      return viteRoutesEdit(project, "@noverax/courier-sveltekit/plugin");
    case "react-router":
    case "remix":
      return viteRoutesEdit(project, "@noverax/courier-remix/plugin");
    case "solid-start":
      return solidStartPlugin(
        project,
        viteRoutesEdit(project, "@noverax/courier-solid/plugin"),
        "Build the pages' routes in: add the plugin to the config's vite.plugins",
      );
  }
}
