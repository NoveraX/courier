import { type DevServerBuilderOptions, executeDevServerBuilder } from "@angular/build";
import {
  type Builder,
  type BuilderContext,
  type BuilderOutput,
  createBuilder,
} from "@angular-devkit/architect";
import type { json } from "@angular-devkit/core";

import { routesForBuild } from "../routes-for-build";

/*
 * Serve the app as Angular's `dev-server` builder does — its options, as
 * Angular's own schema checks them — with the routes a page's proxy client may
 * call: a change to anything they came from reads them again, and the app
 * is built anew with them.
 */
async function* serveWithRoutes(
  options: DevServerBuilderOptions,
  context: BuilderContext,
): AsyncIterable<BuilderOutput> {
  const plugin = await routesForBuild(context, true);
  yield* executeDevServerBuilder(options, context, { buildPlugins: [plugin] });
}

/**
 * Courier's `dev-server` builder: Angular's own, with the routes Courier
 * builds from the config.
 *
 * @example
 * ```json
 * "serve": { "builder": "@noverax/courier-angular:dev-server", "options": { "buildTarget": "app:build" } }
 * ```
 */
const builder: Builder<DevServerBuilderOptions & json.JsonObject> = createBuilder(serveWithRoutes);

// biome-ignore lint/style/noDefaultExport: Angular's architect takes a builder as its module's export itself
export default builder;
