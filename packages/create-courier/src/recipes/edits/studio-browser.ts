import type { Project } from "../../project/read-project";
import type { RecipeEdit } from "../recipe-types";
import {
  ASTRO_CONFIGS,
  firstExisting,
  type Integration,
  integrationEdit,
  NUXT_CONFIGS,
  VITE_CONFIGS,
} from "./config-integration";

/* Studio's integration in a config's list, and the step that names it where the command cannot add it. */
function studioEdit(integration: Omit<Integration, "what">): RecipeEdit {
  return integrationEdit({
    ...integration,
    what: `Connect the browser to Studio: add ${integration.item} to the config's ${integration.property}`,
  });
}

/* Studio's entries whose `courierStudio()` is Vite's plugin. */
const VITE_ENTRIES = ["vite", "react", "vue", "sveltekit", "remix", "solid"];

/**
 * The edit that connects the browser to Studio in an app Vite serves:
 * `courierStudio()` in the config's `plugins`, from the framework's entry
 * of `@noverax/courier-studio`.
 *
 * @param project - The project
 * @param entry - The framework's entry: `react`, `sveltekit`, `remix`, `solid`, `vue`
 * @returns The edit
 * @example
 * ```ts
 * viteStudioEdit(project, "react").path; // "vite.config.ts"
 * ```
 */
export function viteStudioEdit(project: Project, entry: string): RecipeEdit {
  return studioEdit({
    path: firstExisting(project, VITE_CONFIGS),
    purpose: "connects the browser to Studio while you develop",
    callees: ["defineConfig"],
    property: "plugins",
    name: "courierStudio",
    item: "courierStudio()",
    from: `@noverax/courier-studio/${entry}`,
    also: VITE_ENTRIES.map((each) => `@noverax/courier-studio/${each}`),
  });
}

/**
 * The edit that connects Astro's pages to Studio: `courierStudio()` in the
 * config's `integrations`.
 *
 * @param project - The project
 * @returns The edit
 * @example
 * ```ts
 * astroStudioEdit(project).path; // "astro.config.mjs"
 * ```
 */
export function astroStudioEdit(project: Project): RecipeEdit {
  return studioEdit({
    path: firstExisting(project, ASTRO_CONFIGS),
    purpose: "connects the pages to Studio while you develop",
    callees: ["defineConfig"],
    property: "integrations",
    name: "courierStudio",
    item: "courierStudio()",
    from: "@noverax/courier-studio/astro",
  });
}

/**
 * The edit that connects a Nuxt app's pages to Studio: Studio's module in
 * the config's `modules`.
 *
 * @param project - The project
 * @returns The edit
 * @example
 * ```ts
 * nuxtStudioEdit(project).path; // "nuxt.config.ts"
 * ```
 */
export function nuxtStudioEdit(project: Project): RecipeEdit {
  return studioEdit({
    path: firstExisting(project, NUXT_CONFIGS),
    purpose: "connects the pages to Studio while you develop",
    callees: ["defineNuxtConfig"],
    property: "modules",
    name: "courierStudioModule",
    item: "courierStudioModule",
    from: "@noverax/courier-studio/nuxt",
  });
}
