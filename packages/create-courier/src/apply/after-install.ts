import { SETUP_LIMITS } from "../limits";
import type { Plan } from "../plan/build-plan";
import type { RecipeContext } from "../recipes/recipe-types";
import type { SetupReport } from "../report/setup-report";
import { runTool, toolFailure } from "./run-tool";

/* The lines of a failed program's output its warning ends with: why it failed, without the rest. */
const PREPARE_LINES_SHOWN = 5;

/**
 * Run the programs that write the types the added files read — Astro's
 * `astro sync` — once the packages are installed; one that fails is
 * reported with its last lines, and the type check says what is missing.
 *
 * @param ctx - The project, and what is set up in it
 * @param plan - The plan
 * @param report - Where to tell of one that fails
 * @example
 * ```ts
 * await prepare(ctx, plan, io.report);
 * ```
 */
export async function prepare(ctx: RecipeContext, plan: Plan, report: SetupReport): Promise<void> {
  for (const { bin, args } of plan.prepare) {
    const command = ctx.manager.exec(bin, args);
    const result = await runTool(command, {
      cwd: ctx.project.root,
      output: { kind: "quiet" },
      deadlineMs: SETUP_LIMITS.prepareMs,
    });
    if (result.status !== 0 || result.stopped !== undefined) {
      const said = toolFailure(command, result, SETUP_LIMITS.prepareMs);
      report.prepareFailed(said, result.tail.trimEnd().split("\n").slice(-PREPARE_LINES_SHOWN));
    }
  }
}
