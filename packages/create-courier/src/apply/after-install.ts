import type { Terminal } from "../add-courier";
import { SETUP_LIMITS } from "../limits";
import type { Plan } from "../plan/build-plan";
import type { RecipeContext } from "../recipes/recipe-types";
import { runTool, toolFailure } from "./run-tool";
import { type Touched, typecheckTouched } from "./typecheck";

/* The lines of a failed program's output its warning ends with: why it failed, without the rest. */
const PREPARE_LINES_SHOWN = 5;

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
    const result = await runTool(command, {
      cwd: ctx.project.root,
      output: { kind: "quiet" },
      deadlineMs: SETUP_LIMITS.prepareMs,
    });
    if (result.status !== 0 || result.stopped !== undefined) {
      const said = result.tail.trimEnd().split("\n").slice(-PREPARE_LINES_SHOWN);
      terminal.print([
        terminal.style.yellow(toolFailure(command, result, SETUP_LIMITS.prepareMs)),
        ...said.filter((line) => line.trim() !== "").map((line) => terminal.style.dim(`  ${line}`)),
      ]);
    }
  }
}
