import { basename } from "node:path";

import { withAgents } from "./agents";
import { applyPlan } from "./apply/apply-plan";
import type { CreateRun } from "./create-run";
import { frameworkOf } from "./framework-of";
import { buildPlan, changesAnything, type Plan } from "./plan/build-plan";
import { gitState } from "./preflight/git-state";
import { goAhead } from "./preflight/go-ahead";
import { configuredSources } from "./project/configured-sources";
import { importExtension } from "./project/module-style";
import { managerFor } from "./project/package-manager";
import { portsOf } from "./project/ports";
import { readProject } from "./project/read-project";
import type { Recipe, RecipeContext, RecipeFile, SetupChoices } from "./recipes/recipe-types";
import { routesAsked, routesModeOf } from "./routes-mode";
import type { SetupIO } from "./setup-io";
import { wantsMcp } from "./wants-mcp";

/* What a plan that changes nothing says: what is left to the person is listed above it. */
function doneLine(plan: Plan, configured: boolean): string {
  if (plan.manual.length > 0)
    return "Nothing here is for the command to change: the steps left to you are above.";
  return configured ? "Nothing is missing." : "Courier is set up here already.";
}

/*
 * The example's files, as the recipe writes them in a project without
 * Courier, for the plan to install what those an earlier setup added
 * need: in a project set up already, the recipe adds no example.
 */
function exampleFiles(
  ctx: RecipeContext,
  framework: { readonly recipe: (ctx: RecipeContext) => Recipe },
): readonly RecipeFile[] {
  if (ctx.configured === undefined) return [];
  const choices = { ...ctx.choices, mocks: true };
  return framework.recipe({ ...ctx, configured: undefined, choices }).files;
}

async function choicesOf(run: CreateRun, io: SetupIO): Promise<SetupChoices> {
  const mcp = await wantsMcp(run, io);
  return {
    studio: run.studio !== false,
    mocks: run.mocks !== false,
    mcp,
    openapi: run.openapi,
    name: run.name,
    routes: routesAsked(run.routes),
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
 * @param io - Where to tell what it does, and whether to ask
 * @returns The exit status
 * @example
 * ```ts
 * process.exitCode = await addCourier("/work/shop", { yes: true }, io);
 * ```
 */
export async function addCourier(root: string, run: CreateRun, io: SetupIO): Promise<number> {
  const project = readProject(root);
  if (!project.exists("tsconfig.json")) {
    throw new Error(
      "Courier is typed end to end, and this project has no tsconfig.json: add TypeScript first",
    );
  }
  const framework = frameworkOf(project, run.framework);
  const manager = managerFor(root, run["package-manager"]);
  const version = project.version(framework.marker);
  const choices = await choicesOf(run, io);
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
    routes: routesModeOf(project, framework, choices.routes),
  };
  const plan = buildPlan(ctx, withAgents(ctx, framework.recipe(ctx)), exampleFiles(ctx, framework));
  const name = project.manifest.name ?? basename(root);
  const title = `Set Courier up in ${name} (${framework.label} ${version ?? ""}, ${manager.name})`;
  /* A project this run created has no changes of the person's for the setup's to be mixed with. */
  const git = run.fresh === true ? undefined : await gitState(root);
  io.report.plan({ title, plan, configured, git });
  if (!changesAnything(plan) && run.openapi === undefined) {
    const said = doneLine(plan, configured !== undefined);
    io.report.end({ kind: "unchanged", said, next: plan.next });
    return 0;
  }
  if (run["dry-run"] === true) {
    io.report.end({ kind: "dry-run" });
    return 0;
  }
  const words = {
    question: "Set Courier up?",
    unasked:
      "Nothing was changed: run it again with --yes to set Courier up, or --dry-run to only show the plan.",
    declined: "Nothing was changed.",
  };
  if (!(await goAhead(run, io, words, git))) return 1;
  return applyPlan(ctx, plan, run, io);
}
