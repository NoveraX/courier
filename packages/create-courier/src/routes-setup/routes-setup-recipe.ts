import { type RoutesFramework, routesPluginOf } from "../recipes/edits/framework-routes";
import { routeConfigSteps } from "../recipes/edits/route-config";
import { studioRoutesOffEdit } from "../recipes/edits/studio-routes-off";
import type { ManualStep, Recipe, RecipeContext } from "../recipes/recipe-types";
import { devStep } from "../recipes/shared/next-steps";
import { courierPackage } from "../recipes/shared/packages";
import { type RecipePart, sortParts } from "../recipes/shared/recipe-parts";
import { registerStep } from "../recipes/shared/routes-register";
import { routesClientEdits } from "./routes-clients";
import { type RoutesModule, routesModules } from "./routes-modules";

/* Each framework's package, whose `/plugin` entry the build's config imports. */
const ADAPTERS: Readonly<Record<RoutesFramework, string>> = {
  next: "@noverax/courier-next",
  nuxt: "@noverax/courier-nuxt",
  sveltekit: "@noverax/courier-sveltekit",
  astro: "@noverax/courier-astro",
  "react-router": "@noverax/courier-remix",
  remix: "@noverax/courier-remix",
  "solid-start": "@noverax/courier-solid",
  "tanstack-start-react": "@noverax/courier-tanstack-start",
  "tanstack-start-solid": "@noverax/courier-tanstack-start",
};

/* The routes module no page takes once its importers take the plugin's: the person's to delete. */
function unusedStep(module: RoutesModule): ManualStep {
  return {
    file: module.path,
    what: "No module takes its routes from here once Courier's plugin builds them in: delete it, with the routes script that writes it again, when you are done with the file",
    lines: [],
  };
}

/**
 * What moving a project set up already to the routes Courier's plugin
 * builds in takes: the plugin in the build's config; each module that
 * takes a routes module Courier wrote moved to `@noverax/courier/routes`,
 * the config registered there — or, where no module takes one, the step
 * that registers it; Studio kept from writing the module again; and the
 * plugin installed — a dependency where `next start` loads the config —
 * beside the framework's package of this release, whose `/plugin` entry
 * the config imports. The routes module is left for the person to delete.
 *
 * @param ctx - The project, and what is set up in it
 * @param id - The framework
 * @returns What it takes
 * @example
 * ```ts
 * routesSetupRecipe(ctx, "sveltekit").edits.map((edit) => edit.path); // ["vite.config.ts", "src/lib/courier/caller.ts", "courier.config.ts"]
 * ```
 */
export function routesSetupRecipe(ctx: RecipeContext, id: RoutesFramework): Recipe {
  const modules = routesModules(ctx.project);
  const plugin = routesPluginOf(ctx.project, id);
  const clients = modules.flatMap((module) => routesClientEdits(ctx, module));
  const parts: RecipePart[] = [
    ...(plugin === undefined ? [] : [plugin]),
    ...clients,
    studioRoutesOffEdit(ctx, true),
    ...(clients.length === 0 ? registerStep(ctx) : []),
    ...(id === "react-router" || id === "remix" ? routeConfigSteps(ctx) : []),
    ...modules.map(unusedStep),
  ];
  const { files, edits, manual } = sortParts(parts);
  const build = courierPackage("@noverax/courier-build");
  const atStart = id === "next";
  return {
    files,
    edits,
    dependencies: [courierPackage(ADAPTERS[id]), ...(atStart ? [build] : [])],
    devDependencies: atStart ? [] : [build],
    scripts: {},
    manual,
    next: [devStep(ctx, undefined)],
  };
}
