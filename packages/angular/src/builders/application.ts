import { type ApplicationBuilderOptions, buildApplication } from "@angular/build";
import {
  type Builder,
  type BuilderContext,
  type BuilderOutput,
  createBuilder,
} from "@angular-devkit/architect";
import type { json } from "@angular-devkit/core";

import { routesForBuild } from "../routes-for-build";

/*
 * Build the app as Angular's `application` builder does — its options, as
 * Angular's own schema checks them — with the routes a page's proxy client
 * may call, read from `courier.config.ts`, in place of the module
 * `@noverax/courier/routes` ships. A page that takes the config itself
 * fails the build.
 */
async function* buildWithRoutes(
  options: ApplicationBuilderOptions,
  context: BuilderContext,
): AsyncIterable<BuilderOutput> {
  const plugin = await routesForBuild(context, options.watch === true);
  yield* buildApplication(options, context, { codePlugins: [plugin] });
}

/**
 * Courier's `application` builder: Angular's own, with the routes Courier
 * builds from the config.
 *
 * @example
 * ```json
 * "build": { "builder": "@noverax/courier-angular:application", "options": { "browser": "src/main.ts" } }
 * ```
 */
const builder: Builder<ApplicationBuilderOptions & json.JsonObject> =
  createBuilder(buildWithRoutes);

// biome-ignore lint/style/noDefaultExport: Angular's architect takes a builder as its module's export itself
export default builder;
