import { basename } from "node:path";

import { applyPlan } from "./apply/apply-plan";
import { frameworkOf } from "./framework-of";
import { buildPlan, changesAnything } from "./plan/build-plan";
import { gitState } from "./preflight/git-state";
import { goAhead } from "./preflight/go-ahead";
import { configuredSources } from "./project/configured-sources";
import { importExtension } from "./project/module-style";
import { managerFor } from "./project/package-manager";
import { MOCK_DEFAULT_PORT, STUDIO_DEFAULT_PORT } from "./project/ports";
import { readProject } from "./project/read-project";
import { isRoutesFramework } from "./recipes/edits/framework-routes";
import type { RecipeContext } from "./recipes/recipe-types";
import { routesSetupRecipe } from "./routes-setup/routes-setup-recipe";
import type { SetupIO } from "./setup-io";

export type { SetupIO } from "./setup-io";

/** What the command line asked of the routes' setup. */
export interface RoutesSetupRun {
  /** The framework, where the project's package.json does not tell it. */
  framework?: string | undefined;
  "package-manager"?: string | undefined;
  /** `false` to write the changes and name the install commands. */
  install?: boolean | undefined;
  yes?: boolean | undefined;
  /** Go ahead with `--yes` where git has changes not committed. */
  "allow-dirty"?: boolean | undefined;
  "dry-run"?: boolean | undefined;
}

const DONE = "The pages take their routes from Courier's plugin.";

/**
 * Move a project Courier is set up in to the routes Courier's plugin for
 * its build gives the pages: work out the plan — the plugin in the build's
 * config, each module that takes a routes module Courier wrote moved to
 * `@noverax/courier/routes`, with the config registered there, Studio kept
 * from writing the module — show it, and once the person agrees, or with
 * `--yes`, make the changes, install the plugin and check the types of
 * what changed. `courier-cli setup` runs it.
 *
 * @param root - The project's folder, which holds its package.json
 * @param run - What the command line asked for
 * @param io - Where to tell what it does, and whether to ask
 * @returns The exit status
 * @throws {Error} When the project has no tsconfig.json, Courier has no plugin for its framework, or its config declares no API
 * @example
 * ```ts
 * process.exitCode = await setUpRoutes("/work/shop", { yes: true }, io);
 * ```
 */
export async function setUpRoutes(root: string, run: RoutesSetupRun, io: SetupIO): Promise<number> {
  const project = readProject(root);
  if (!project.exists("tsconfig.json")) {
    throw new Error(
      "The routes are typed from courier.config.ts, and this project has no tsconfig.json",
    );
  }
  const framework = frameworkOf(project, run.framework);
  if (!isRoutesFramework(framework.id)) {
    throw new Error(
      `Courier has no plugin for ${framework.label}'s build: its pages take courier.routes.ts, which courier-cli routes writes`,
    );
  }
  const configured = configuredSources(project);
  if (configured === undefined) {
    throw new Error(
      "courier.config.ts declares no API yet: set Courier up first, with npx @noverax/create-courier",
    );
  }
  const manager = managerFor(root, run["package-manager"]);
  const version = project.version(framework.marker);
  const ctx: RecipeContext = {
    project,
    manager,
    choices: { studio: false, mocks: false, mcp: false, routes: "plugin" },
    extension: importExtension(root),
    version,
    ports: { studio: STUDIO_DEFAULT_PORT, mock: MOCK_DEFAULT_PORT },
    fresh: false,
    configured,
    routes: "plugin",
  };
  const plan = buildPlan(ctx, routesSetupRecipe(ctx, framework.id));
  const name = project.manifest.name ?? basename(root);
  const title = `Build the pages' routes in with Courier's plugin in ${name} (${framework.label} ${version ?? ""}, ${manager.name})`;
  const git = await gitState(root);
  io.report.plan({ title, plan, git });
  if (!changesAnything(plan)) {
    const said =
      plan.manual.length > 0
        ? "Nothing here is for the command to change: the steps left to you are above."
        : DONE;
    io.report.end({ kind: "unchanged", said, next: [] });
    return 0;
  }
  if (run["dry-run"] === true) {
    io.report.end({ kind: "dry-run" });
    return 0;
  }
  const words = {
    question: "Make the changes?",
    unasked:
      "Nothing was changed: run it again with --yes to make the changes, or --dry-run to only show the plan.",
    declined: "Nothing was changed.",
  };
  if (!(await goAhead(run, io, words, git))) return 1;
  return applyPlan(ctx, plan, run, io, DONE);
}
