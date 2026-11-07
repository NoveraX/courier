import type { Project } from "../../project/read-project";
import type { ManualStep, RecipeEdit } from "../recipe-types";
import {
  ASTRO_CONFIGS,
  firstExisting,
  type Integration,
  integrationEdit,
  NUXT_CONFIGS,
  RSBUILD_CONFIGS,
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
 * The step that tells the person, in an app Rsbuild builds, that Studio
 * has no plugin to connect the browser with: only the app's server
 * connects to it.
 *
 * @param project - The project
 * @param page - The page that says what Courier does under Rsbuild
 * @returns The step, at the app's Rsbuild config
 * @example
 * ```ts
 * rsbuildStudioStep(project, "https://courier.noverax.cloud/docs/frameworks/tanstack-start#rsbuild").file; // "rsbuild.config.ts"
 * ```
 */
export function rsbuildStudioStep(project: Project, page: string): ManualStep {
  return {
    file: firstExisting(project, RSBUILD_CONFIGS),
    what: `Studio has no plugin for Rsbuild, so the browser does not connect to it, only the app's server: see ${page}`,
    lines: [],
  };
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
