import { basename, relative, resolve, sep } from "node:path";
import { createLogger } from "@noverax/courier";
import {
  CONFIG_READ_LIMIT_MS,
  ConfigLoadError,
  enterDefinitionsPhase,
  type LoadedCourierConfig,
  loadCourierConfig,
  withoutSecrets,
} from "@noverax/courier-build/config";
import { type ArgsDef, defineCommand } from "citty";
import { DOTENV_ARG, loadProjectEnv } from "../project-env";
import { closeFormatProcesses } from "../project-format/formatter-host";
import { projectRootAt } from "../project-fs/project-root";
import { composeRoutesModule } from "../routes-module/compose-routes-module";
import { routesModulePath } from "../routes-module/routes-module-path";
import { routesSaid } from "../routes-module/routes-said";
import { routesSettingProblem } from "../routes-module/routes-setting-problem";
import { writeRoutesModule } from "../routes-module/write-routes-module";
import { messageOf } from "../util/message-of";

const log = createLogger("Routes");

/** Where the command reads the project's variables from, for a config whose code threw. */
const VARIABLES_READ =
  "courier-cli reads the project's variables from .env.development.local, .env.local, .env.development and .env, those there are, or from the files --dotenv names.";

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
 * `courier-cli routes` — write the project's routes module, as Studio
 * writes it while it runs: every endpoint marked `.expose()`, which a
 * page's proxy client may call, and how the page reaches it, read from
 * `courier.config.ts`. With `--check`, it writes nothing and fails when the
 * module on disk is out of date, for a CI step.
 *
 * @example
 * ```sh
 * courier-cli routes --check
 * ```
 */
export const routesCommand = defineCommand({
  meta: { name: "routes", description: "Write the routes a page's proxy client takes" },
  args: ROUTES_ARGS,
  async run({ args }) {
    const root = resolve(args.cwd ?? process.cwd());
    enterDefinitionsPhase();
    let gaveUp = false;
    try {
      process.exitCode = (await writeRoutes(root, args)) ? 0 : 1;
    } catch (error) {
      report(error);
      process.exitCode = 1;
      gaveUp = error instanceof ConfigLoadError && error.code === "LOAD_TIMED_OUT";
    } finally {
      await closeFormatProcesses(root);
    }
    /* The config's code still runs, and what it opened would keep the process for good. */
    if (gaveUp) process.exit(1);
  },
});

/* One line naming the problem, and for a config that did not load, one saying what to do. A
   problem of any other kind may be what a getter of the config threw as its sources were read,
   in the project's words, for a CI log: it is said with no secret in it, as the loader says one. */
function report(error: unknown): void {
  if (!(error instanceof ConfigLoadError)) {
    log.error(withoutSecrets(messageOf(error)));
    return;
  }
  log.error(error.message);
  log.info(error.hint);
  if (error.code === "EVALUATION_FAILED") log.info(VARIABLES_READ);
  /* Masked already: the cause holds no variable's value. */
  if (error.cause !== undefined) log.debug("What the project's code threw", error.cause);
}

/* Whether the module is as courier.config.ts gives it, or now is. */
async function writeRoutes(
  root: string,
  args: { check?: boolean | undefined; out?: string | undefined; dotenv?: string | undefined },
): Promise<boolean> {
  loadProjectEnv(root, args.dotenv);
  const loaded = await loadCourierConfig({
    cwd: root,
    requireAtCwd: true,
    projectTransforms: true,
    timeoutMs: CONFIG_READ_LIMIT_MS,
  });
  if (loaded === null)
    throw new Error(`No courier.config.* in ${root}: the routes are read from it`);
  const path = args.out === undefined ? configured(loaded) : outPath(root, args.out);
  if (path === null) {
    const none = `${basename(loaded.configFile)} sets studio.routes to false, so the project has no routes module`;
    if (args.check !== true) throw new Error(`${none} to write; name one with --out`);
    log.info(none);
    return true;
  }
  const { module, problem } = composeRoutesModule(root, loaded, path);
  if (problem !== null) throw new Error(`${path} cannot be written: ${problem}`);
  const outcome = await writeRoutesModule(projectRootAt(root), module, { check: args.check });
  const [level, message] = routesSaid(outcome);
  log[level === "debug" ? "info" : level](message);
  return outcome.status !== "stale" && outcome.status !== "foreign";
}

/* Held to what Studio holds it to as the config loads: a path in the project, or false. */
function configured(loaded: LoadedCourierConfig): string | null {
  const setting = loaded.config.studio?.routes;
  const problem = routesSettingProblem(setting);
  if (problem !== null) throw new Error(problem);
  return routesModulePath(loaded.configFile, setting);
}

/* Named from where the command runs, as a path given on its command line is; kept to the project. */
function outPath(root: string, out: string): string {
  const path = relative(root, resolve(out)).split(sep).join("/");
  const problem = routesSettingProblem(path, "--out");
  if (problem !== null) throw new Error(problem);
  return path;
}
