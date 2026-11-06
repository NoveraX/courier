import type { CreateRun } from "../create-run";
import { changedLines } from "../edit/line-diff";
import type { Plan, PlannedEdit } from "../plan/build-plan";
import type { RecipeContext } from "../recipes/recipe-types";
import type { SetupIO } from "../setup-io";
import { prepare } from "./after-install";
import { importSpecification } from "./import-specification";
import { install, installCommands } from "./install";
import { type Touched, typecheckTouched } from "./typecheck";
import { checkEditsCurrent, writePlannedEdits, writePlannedFiles } from "./write-plan";

/* The lines each edit added, by file, for the type check to hold it to. */
function changedByEdits(edits: readonly PlannedEdit[]): Map<string, Set<number>> {
  return new Map(
    edits
      .filter((edit) => edit.state === "edit")
      .map((edit) => [
        edit.path,
        new Set(
          changedLines(edit.before, edit.after)
            .filter((line) => line.sign === "+")
            .map((line) => line.line),
        ),
      ]),
  );
}

/* Install, then import the specification and check the types, which need the packages. */
async function installAndCheck(
  ctx: RecipeContext,
  plan: Plan,
  run: CreateRun,
  touched: Touched,
  io: SetupIO,
): Promise<number> {
  await install(ctx.project.root, installCommands(ctx.manager, plan));
  await prepare(ctx, plan, io.report);
  if (run.openapi !== undefined) {
    const status = await importSpecification(ctx.project.root, run.openapi, run.name);
    if (status !== 0) return status;
  }
  const outcome = await typecheckTouched(ctx.project.root, touched);
  io.report.typechecked(outcome);
  if (outcome.kind !== "errors") return 0;
  io.report.end({ kind: "typecheck-failed" });
  return 1;
}

/**
 * Carry a plan out: write its files, scripts and changes, install its
 * packages — or name the commands with `--no-install` — import the
 * specification if one was given, check the types of what it added and
 * changed, and report what is left to the person and what to run next.
 *
 * @param ctx - The project, and what is set up in it
 * @param plan - The plan the person agreed to
 * @param run - What the command line asked for
 * @param io - Where to tell what it does
 * @param done - What it says once the packages are in and the types check
 * @returns The exit status: 0 once set up, 1 when what it added does not type-check
 * @example
 * ```ts
 * return applyPlan(ctx, plan, run, io);
 * ```
 */
export async function applyPlan(
  ctx: RecipeContext,
  plan: Plan,
  run: CreateRun,
  io: SetupIO,
  done = "Courier is set up.",
): Promise<number> {
  const { root } = ctx.project;
  checkEditsCurrent(root, plan.edits);
  const written = writePlannedFiles(root, plan.files);
  const changed = writePlannedEdits(root, plan.edits);
  io.report.wrote({ written, changed });
  if (run.install === false) {
    io.report.end({ kind: "install-left", plan, commands: installCommands(ctx.manager, plan) });
    return 0;
  }
  const touched: Touched = { added: written, changed: changedByEdits(plan.edits) };
  const status = await installAndCheck(ctx, plan, run, touched, io);
  if (status !== 0) return status;
  io.report.end({ kind: "applied", plan, said: done });
  return 0;
}
