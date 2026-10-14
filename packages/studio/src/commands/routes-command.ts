import { basename, relative, resolve, sep } from "node:path";
import { createLogger } from "@noverax/courier";
import { type ArgsDef, defineCommand } from "citty";

import { type LoadedCourierConfig, loadCourierConfig } from "../server/config-loader";
import { DOTENV_ARG, loadProjectEnv } from "../server/project-env";
import { closeFormatProcesses } from "../server/project-format/formatter-host";
import { projectRootAt } from "../server/project-fs/project-root";
import { composeRoutesModule } from "../server/routes-module/compose-routes-module";
import { routesModulePath } from "../server/routes-module/routes-module-path";
import { routesSaid } from "../server/routes-module/routes-said";
import { routesSettingProblem } from "../server/routes-module/routes-setting-problem";
import { writeRoutesModule } from "../server/routes-module/write-routes-module";

const log = createLogger("Routes");

/** The `routes` command's options. */
export const ROUTES_ARGS = {
  check: {
    type: "boolean",
    description: "Write nothing, and fail when the module is not what courier.config.ts gives",
  },
  out: {
    type: "string",
    valueHint: "path",
    description:
      "The module to write, in the project (default: studio.routes, or courier.routes.ts)",
  },
  cwd: {
    type: "string",
    valueHint: "dir",
    description: "Project root directory (default: current working directory)",
  },
  dotenv: DOTENV_ARG,
} as const satisfies ArgsDef;

/**
 * `courier-studio routes` — write the project's routes module, as Studio
 * writes it while it runs: every endpoint marked `.expose()`, which a
 * page's proxy client may call, and how the page reaches it, read from
 * `courier.config.ts`. With `--check`, it writes nothing and fails when the
 * module on disk is out of date, for a CI step.
 *
 * @example
 * ```sh
 * courier-studio routes --check
 * ```
 */
export const routesCommand = defineCommand({
  meta: { name: "routes", description: "Write the routes a page's proxy client takes" },
  args: ROUTES_ARGS,
  async run({ args }) {
    const root = resolve(args.cwd ?? process.cwd());
    try {
      process.exitCode = (await writeRoutes(root, args)) ? 0 : 1;
    } catch (error) {
      /* One line naming the problem, as the server's own start does, and a failing status. */
      log.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    } finally {
      await closeFormatProcesses(root);
    }
  },
});

/* Whether the module is as courier.config.ts gives it, or now is. */
async function writeRoutes(
  root: string,
  args: { check?: boolean | undefined; out?: string | undefined; dotenv?: string | undefined },
): Promise<boolean> {
  loadProjectEnv(root, args.dotenv);
  const loaded = await loadCourierConfig(root);
  const path = args.out === undefined ? configured(loaded) : outPath(root, args.out);
  if (path === null) {
    const none = `${basename(loaded.configFile)} sets studio.routes to false, so the project has no routes module`;
    if (args.check !== true) throw new Error(`${none} to write; name one with --out`);
    log.info(none);
    return true;
  }
  const { module, problem } = composeRoutesModule(root, loaded, path);
  if (problem !== null) throw new Error(`Studio cannot write ${path}: ${problem}`);
  const outcome = await writeRoutesModule(projectRootAt(root), module, { check: args.check });
  const [level, message] = routesSaid(outcome);
  log[level === "debug" ? "info" : level](message);
  return outcome.status !== "stale" && outcome.status !== "foreign";
}

function configured(loaded: LoadedCourierConfig): string | null {
  return routesModulePath(loaded.configFile, loaded.config.studio?.routes);
}

/* Named from where the command runs, as a path given on its command line is; kept to the project. */
function outPath(root: string, out: string): string {
  const path = relative(root, resolve(out)).split(sep).join("/");
  const problem = routesSettingProblem(path, "--out");
  if (problem !== null) throw new Error(problem);
  return path;
}
