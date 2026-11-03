import { executeUnitTestBuilder, type UnitTestBuilderOptions } from "@angular/build";
import {
  type Builder,
  type BuilderContext,
  type BuilderOutput,
  createBuilder,
} from "@angular-devkit/architect";
import type { json } from "@angular-devkit/core";

import { routesForBuild } from "../routes-for-build";

/*
 * Run the app's tests as Angular's `unit-test` builder does — its options,
 * as Angular's own schema checks them — with the routes a test takes.
 */
async function* testWithRoutes(
  options: UnitTestBuilderOptions,
  context: BuilderContext,
): AsyncIterable<BuilderOutput> {
  const plugin = await routesForBuild(context, options.watch === true);
  yield* executeUnitTestBuilder(options, context, { codePlugins: [plugin] });
}

/**
 * Courier's `unit-test` builder: Angular's own, with the routes Courier
 * builds from the config.
 *
 * @example
 * ```json
 * "test": { "builder": "@noverax/courier-angular:unit-test", "options": { "buildTarget": "app:build" } }
 * ```
 */
const builder: Builder<UnitTestBuilderOptions & json.JsonObject> = createBuilder(testWithRoutes);

// biome-ignore lint/style/noDefaultExport: Angular's architect takes a builder as its module's export itself
export default builder;
