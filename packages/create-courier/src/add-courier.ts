import { basename } from "node:path";
import type { TerminalStyle } from "@noverax/courier/internal";
import { withAgents } from "./agents";
import { applyPlan } from "./apply/apply-plan";
import type { CreateRun } from "./create-run";
import { frameworkOf } from "./framework-of";
import { buildPlan, changesAnything, type Plan } from "./plan/build-plan";
import { nextLines, planLines } from "./plan/plan-lines";
import { type ConfiguredSources, configuredSources } from "./project/configured-sources";
import { importExtension } from "./project/module-style";
import {
  invokingManager,
  type PackageManager,
  packageManager,
  projectManager,
} from "./project/package-manager";
import { portsOf } from "./project/ports";
import { readProject } from "./project/read-project";
import { askYesNo } from "./prompt";
import type { RecipeContext, SetupChoices } from "./recipes/recipe-types";
import { wantsMcp } from "./wants-mcp";

/** Where the command writes, and whether a person can answer its questions. */
export interface Terminal {
  readonly interactive: boolean;
  readonly style: TerminalStyle;
  print(lines: readonly string[]): void;
}

function managerOf(root: string, asked: string | undefined): PackageManager {
  if (asked === undefined)
    return packageManager(projectManager(root) ?? invokingManager() ?? "npm");
  if (asked === "npm" || asked === "pnpm" || asked === "yarn" || asked === "bun")
    return packageManager(asked);
  throw new Error(`--package-manager takes npm, pnpm, yarn or bun, not "${asked}"`);
}

/* What the config declares, and what the plan does about it. */
function configuredLine(configured: ConfiguredSources, changes: boolean): string {
  const { names, more, path } = configured;
  const count = more ? "its APIs" : `${names.length} ${names.length === 1 ? "API" : "APIs"}`;
  const named = names.length > 0 ? ` (${names.join(", ")}${more ? ", and more" : ""})` : "";
  const then = changes ? " The plan adds no example, only what the project lacks." : "";
  return `Courier is set up here already: ${path} declares ${count}${named}.${then}`;
}

/* What a plan that changes nothing says: what is left to the person is listed above it. */
function doneLine(plan: Plan, configured: boolean): string {
  if (plan.manual.length > 0)
    return "Nothing here is for the command to change: the steps left to you are above.";
  return configured ? "Nothing is missing." : "Courier is set up here already.";
}

async function choicesOf(run: CreateRun, terminal: Terminal): Promise<SetupChoices> {
  const mcp = await wantsMcp(run, terminal);
  return {
    studio: run.studio !== false,
    mocks: run.mocks !== false,
    mcp,
    openapi: run.openapi,
    name: run.name,
  };
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
  const configured = configuredSources(project);
  const ports = await portsOf(project, choices, choices.openapi === undefined && !configured);
  const ctx: RecipeContext = {
    project,
    manager,
    choices,
    extension: importExtension(root),
    version,
    ports,
    fresh: run.fresh === true,
    configured,
  };
  const plan = buildPlan(ctx, withAgents(ctx, framework.recipe(ctx)));
  const name = project.manifest.name ?? basename(root);
  terminal.print(
    planLines(
      `Set Courier up in ${name} (${framework.label} ${version ?? ""}, ${manager.name})`,
      plan,
      terminal.style,
      configured ? [configuredLine(configured, changesAnything(plan))] : [],
    ),
  );
  if (!changesAnything(plan) && run.openapi === undefined) {
    terminal.print([
      doneLine(plan, configured !== undefined),
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
    if (!(await askYesNo("Set Courier up?", true))) {
      terminal.print(["Nothing was changed."]);
      return 1;
    }
  }
  return applyPlan(ctx, plan, run, terminal);
}
