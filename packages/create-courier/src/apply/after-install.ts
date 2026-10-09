import type { Terminal } from "../add-courier";
import type { Plan } from "../plan/build-plan";
import type { RecipeContext } from "../recipes/recipe-types";
import { runTool } from "./run-tool";
import { type Touched, typecheckTouched } from "./typecheck";

/**
 * Check the types of what the setup touched, and say how it went.
 *
 * @param root - The project's folder
 * @param touched - What the setup added and changed
 * @param terminal - Where to write
 * @returns 1 when what the setup added has errors, else 0
 * @example
 * ```ts
 * return reportTypes(root, { added: written, changed }, terminal);
 * ```
 */
export async function reportTypes(
  root: string,
  touched: Touched,
  terminal: Terminal,
): Promise<number> {
  const { style } = terminal;
  const outcome = await typecheckTouched(root, touched);
  if (outcome.kind === "clean") {
    terminal.print(["", "The files Courier added type-check against the project's tsconfig."]);
  } else if (outcome.kind === "no-typescript") {
    terminal.print([
      "",
      style.yellow(
        "TypeScript is not installed in the project, so the files Courier added were not type-checked.",
      ),
    ]);
  } else if (outcome.kind === "unchecked") {
    terminal.print(["", style.yellow(`TypeScript could not check the project: ${outcome.reason}`)]);
  } else if (outcome.kind === "errors") {
    terminal.print([
      "",
      style.red("TypeScript finds errors in what Courier added:"),
      ...outcome.lines,
    ]);
    return 1;
  }
  return 0;
}

/**
 * Run the programs that write the types the added files read — Astro's
 * `astro sync` — once the packages are installed; one that fails is
 * reported, and the type check says what is missing.
 *
 * @param ctx - The project, and what is set up in it
 * @param plan - The plan
 * @param terminal - Where to write
 * @example
 * ```ts
 * await prepare(ctx, plan, terminal);
 * ```
 */
export async function prepare(ctx: RecipeContext, plan: Plan, terminal: Terminal): Promise<void> {
  for (const { bin, args } of plan.prepare) {
    const command = ctx.manager.exec(bin, args);
    const { status } = await runTool(command, ctx.project.root, true);
    if (status !== 0)
      terminal.print([terminal.style.yellow(`${command.join(" ")} failed (exit ${status})`)]);
  }
}
