import { basename } from "node:path";
import type { TerminalStyle } from "@noverax/courier/internal";
import { withAgents } from "./agents";
import { applyPlan } from "./apply/apply-plan";
import type { CreateRun } from "./create-run";
import { detectFramework, FRAMEWORKS, type Framework, frameworkById } from "./frameworks";
import { buildPlan, changesAnything } from "./plan/build-plan";
import { nextLines, planLines } from "./plan/plan-lines";
import { importExtension } from "./project/module-style";
import {
  invokingManager,
  type PackageManager,
  packageManager,
  projectManager,
} from "./project/package-manager";
import { portsOf } from "./project/ports";
import { type Project, readProject } from "./project/read-project";
import { askYesNo } from "./prompt";
import type { RecipeContext, SetupChoices } from "./recipes/recipe-types";

/** Where the command writes, and whether a person can answer its questions. */
export interface Terminal {
  readonly interactive: boolean;
  readonly style: TerminalStyle;
  print(lines: readonly string[]): void;
}

function frameworkOf(
  project: Project,
  asked: string | undefined,
): Framework & Required<Pick<Framework, "recipe">> {
  const framework = asked === undefined ? detectFramework(project) : frameworkById(asked);
  if (framework === undefined) {
    const known = FRAMEWORKS.map((known) => known.label).join(", ");
    throw new Error(
      `No framework Courier sets up was found in package.json; it knows ${known}. Name one with --framework.`,
    );
  }
  const { recipe } = framework;
  if (recipe === undefined)
    throw new Error(`Setting Courier up in ${framework.label} is not in this command yet`);
  return { ...framework, recipe };
}

function managerOf(root: string, asked: string | undefined): PackageManager {
  if (asked === undefined)
    return packageManager(projectManager(root) ?? invokingManager() ?? "npm");
  if (asked === "npm" || asked === "pnpm" || asked === "yarn" || asked === "bun")
    return packageManager(asked);
  throw new Error(`--package-manager takes npm, pnpm, yarn or bun, not "${asked}"`);
}

async function choicesOf(run: CreateRun, terminal: Terminal): Promise<SetupChoices> {
  const studio = run.studio !== false;
  if (run.openapi !== undefined && !studio)
    throw new Error("--openapi imports with Studio's command: leave out --no-studio");
  const mcp =
    run.mcp ??
    (terminal.interactive && run.yes !== true && run["dry-run"] !== true
      ? await askYesNo("Offer the API's reads to AI agents in your editor, over MCP?", false)
      : false);
  return { studio, mocks: run.mocks !== false, mcp, openapi: run.openapi, name: run.name };
}

/**
 * Set Courier up in a TypeScript project: work out the framework's
 * recipe, show the plan, and — once the person agrees, or with `--yes` —
 * add the files, install the packages, import a specification if one was
 * given, and check the added files' types.
 *
 * @param root - The project's folder, which holds its package.json
 * @param run - What the command line asked for
 * @param terminal - Where to write, and whether to ask
 * @returns The exit status
 * @example
 * ```ts
 * process.exitCode = await addCourier("/work/shop", { yes: true }, terminal);
 * ```
 */
export async function addCourier(
  root: string,
  run: CreateRun,
  terminal: Terminal,
): Promise<number> {
  const project = readProject(root);
  if (!project.exists("tsconfig.json")) {
    throw new Error(
      "Courier is typed end to end, and this project has no tsconfig.json: add TypeScript first",
    );
  }
  const framework = frameworkOf(project, run.framework);
  const manager = managerOf(root, run["package-manager"]);
  const version = project.version(framework.marker);
  const choices = await choicesOf(run, terminal);
  const ports = await portsOf(project, choices);
  const ctx: RecipeContext = {
    project,
    manager,
    choices,
    extension: importExtension(root),
    version,
    ports,
    fresh: run.fresh === true,
  };
  const plan = buildPlan(ctx, withAgents(ctx, framework.recipe(ctx)));
  const name = project.manifest.name ?? basename(root);
  terminal.print(
    planLines(
      `Set Courier up in ${name} (${framework.label} ${version ?? ""}, ${manager.name})`,
      plan,
      terminal.style,
    ),
  );
  if (!changesAnything(plan) && run.openapi === undefined) {
    terminal.print([
      "Courier is set up here already.",
      "",
      "Next",
      ...nextLines(plan.next, terminal.style),
    ]);
    return 0;
  }
  if (run["dry-run"] === true) return 0;
  if (run.yes !== true) {
    if (!terminal.interactive) {
      terminal.print([
        "Nothing was changed: run it again with --yes to set Courier up, or --dry-run to only show the plan.",
      ]);
      return 1;
    }
    if (!(await askYesNo("Set Courier up?", true))) return 1;
  }
  return applyPlan(ctx, plan, run, terminal);
}
