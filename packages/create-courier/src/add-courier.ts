import { basename } from "node:path";

import { agentDocsWanted, withAgentDocs } from "./agent-docs";
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
import { setupChoices } from "./questions/setup-choices";
import type { Recipe, RecipeContext, RecipeFile } from "./recipes/recipe-types";
import { addsMock } from "./recipes/shared/wired";
import { routesChoice, routesModeOf } from "./routes-mode";
import { withSecretImport } from "./secret-import";
import type { SetupIO } from "./setup-io";

/* What a plan that changes nothing says: what is left to the person is listed above it. */
function doneLine(plan: Plan, configured: boolean): string {
  if (plan.manual.length > 0)
    return "Nothing here is for the command to change: the steps left to you are above.";
  return configured ? "Nothing is missing." : "Courier is set up here already.";
}

/*
 * The example's files, as the recipe writes them in a project without
 * Courier — its mock among them, which Studio runs — for the plan to
 * install what those an earlier setup added need: in a project set up
 * already, the recipe adds no example.
 */
function exampleFiles(
  ctx: RecipeContext,
  framework: { readonly recipe: (ctx: RecipeContext) => Recipe },
): readonly RecipeFile[] {
  if (ctx.configured === undefined) return [];
  const choices = { ...ctx.choices, studio: true, mocks: true };
  return framework.recipe({ ...ctx, configured: undefined, choices }).files;
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
  const configured = configuredSources(project);
  const choices = await setupChoices(run, io, {
    configured: configured !== undefined,
    /* A project set up already keeps where its pages take their routes from. */
    routes: configured === undefined && routesChoice(project, framework),
    agentRules: agentDocsWanted(project),
  });
  const ports = await portsOf(project, choices, addsMock({ choices, configured }));
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
  const recipe = withSecretImport(ctx, withAgentDocs(ctx, withAgents(ctx, framework.recipe(ctx))));
  const plan = buildPlan(ctx, recipe, exampleFiles(ctx, framework));
  const name = project.manifest.name ?? basename(root);
  const title = `Set Courier up in ${name} (${framework.label} ${version ?? ""}, ${manager.name})`;
  /* A project this run created has no changes of the person's for the setup's to be mixed with. */
  const git = run.fresh === true ? undefined : await gitState(root);
  io.report.plan({ title, plan, configured, git });
  if (!changesAnything(plan) && choices.openapi === undefined) {
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
