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

/** What the plugin line does, for the plan. */
export const ROUTES_PURPOSE = "builds the pages' routes in from the endpoints marked .expose()";

/* The modules whose `courierRoutes()` is Vite's plugin of Courier's routes. */
const VITE_PLUGINS = [
  "@noverax/courier-build/vite",
  "@noverax/courier-sveltekit/plugin",
  "@noverax/courier-remix/plugin",
  "@noverax/courier-solid/plugin",
];

/* Courier's plugin in a config's list, and the step that names it where the command cannot add it. */
function routesEdit(integration: Omit<Integration, "purpose" | "what">): RecipeEdit {
  return integrationEdit({
    ...integration,
    purpose: ROUTES_PURPOSE,
    what: `Build the pages' routes in: add ${integration.item} to the config's ${integration.property}`,
  });
}

/**
 * The edit that builds the pages' routes in for an app Vite builds:
 * `courierRoutes()` in the config's `plugins`, from the framework's
 * `/plugin` entry.
 *
 * @param project - The project
 * @param from - The framework's entry: `@noverax/courier-sveltekit/plugin`, …
 * @returns The edit
 * @example
 * ```ts
 * viteRoutesEdit(project, "@noverax/courier-sveltekit/plugin").path; // "vite.config.ts"
 * ```
 */
export function viteRoutesEdit(project: Project, from: string): RecipeEdit {
  return routesEdit({
    path: firstExisting(project, VITE_CONFIGS),
    callees: ["defineConfig"],
    property: "plugins",
    name: "courierRoutes",
    item: "courierRoutes()",
    from,
    also: VITE_PLUGINS,
  });
}

/**
 * The edit that builds an Astro site's routes in: Courier's integration
 * in the config's `integrations`.
 *
 * @param project - The project
 * @returns The edit
 * @example
 * ```ts
 * astroRoutesEdit(project).path; // "astro.config.mjs"
 * ```
 */
export function astroRoutesEdit(project: Project): RecipeEdit {
  return routesEdit({
    path: firstExisting(project, ASTRO_CONFIGS),
    callees: ["defineConfig"],
    property: "integrations",
    name: "courierRoutesIntegration",
    item: "courierRoutesIntegration()",
    from: "@noverax/courier-astro/plugin",
  });
}

/**
 * The edit that builds a Nuxt app's routes in: Courier's module in the
 * config's `modules`.
 *
 * @param project - The project
 * @returns The edit
 * @example
 * ```ts
 * nuxtRoutesEdit(project).path; // "nuxt.config.ts"
 * ```
 */
export function nuxtRoutesEdit(project: Project): RecipeEdit {
  return routesEdit({
    path: firstExisting(project, NUXT_CONFIGS),
    callees: ["defineNuxtConfig"],
    property: "modules",
    name: "courierRoutesModule",
    item: "courierRoutesModule",
    from: "@noverax/courier-nuxt/plugin",
  });
}
