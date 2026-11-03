import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { BuilderContext } from "@angular-devkit/architect";
import { writtenRoutesPlugin } from "@noverax/courier-build/esbuild";
import type { Plugin } from "esbuild";

/* How the app writes the module elsewhere, should the system's temporary folder not take it. */
const ELSEWHERE = "the TMPDIR variable";

/**
 * The esbuild plugin an Angular build takes its routes with: they are read
 * from the config found from the project's root and written to a module in
 * a folder of the system's own, by its real path, as esbuild names it — a
 * file Angular reads, so a change to it builds the app again. The folder is
 * removed once the builder ends, and with the process.
 *
 * @param context - The builder's context
 * @param watch - Whether the build runs again on a change: a dev server, or `ng build --watch`
 * @returns The plugin
 * @throws RoutesReadError `ROUTES_NOT_WRITTEN` when the module cannot be written
 * @example
 * ```ts
 * const plugin = await routesForBuild(context, false);
 * yield* buildApplication(options, context, { codePlugins: [plugin] });
 * ```
 */
export async function routesForBuild(context: BuilderContext, watch: boolean): Promise<Plugin> {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "courier-angular-")));
  const remove = (): void => rmSync(folder, { recursive: true, force: true });
  context.addTeardown(remove);
  process.once("exit", remove);
  return writtenRoutesPlugin({
    root: await projectRoot(context),
    file: join(folder, "routes.js"),
    watch,
    elsewhere: ELSEWHERE,
  });
}

/* The root of the project the builder runs for: the config is found from there, and above it. */
async function projectRoot(context: BuilderContext): Promise<string> {
  const project = context.target?.project;
  if (project === undefined) return context.workspaceRoot;
  const metadata = await context.getProjectMetadata(project);
  const root = typeof metadata.root === "string" ? metadata.root : "";
  return isAbsolute(root) ? root : resolve(context.workspaceRoot, root);
}
