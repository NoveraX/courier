import type { CreateRun } from "../create-run";
import { changedLines } from "../edit/line-diff";
import type { Plan, PlannedEdit } from "../plan/build-plan";
import type { RecipeContext } from "../recipes/recipe-types";
import type { SetupIO } from "../setup-io";
import { prepare } from "./after-install";
import { importSpecification } from "./import-specification";
import { installCommands } from "./install";
import { transact } from "./transaction";
import { type Touched, typecheckTouched } from "./typecheck";

/**
 * The lines each change of a plan adds, by file, for a type check to hold
 * it to: only the errors on them count.
 *
 * @param edits - The plan's edits
 * @returns Each changed file's added lines, numbered from 1
 * @example
 * ```ts
 * typecheckTouched(root, { added: written, changed: changedByEdits(plan.edits) });
 * ```
 */
export function changedByEdits(edits: readonly PlannedEdit[]): Map<string, Set<number>> {
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

/**
 * Carry a setup's plan out as one transaction: install its packages
 * first — or, with `--no-install`, name the commands — then write its
 * files and its changes, run what writes the types they read, and import
 * the specification if one was given; any of it failing, or Ctrl+C,
 * undoes what it did. Once it holds, the types of what it added and
 * changed are checked, and the person is told what is left to them and
 * what to run.
 *
 * @param ctx - The project, and what is set up in it
 * @param plan - The plan the person agreed to
 * @param run - What the command line asked for
 * @param io - Where to tell what it does
 * @param done - What it says once the packages are in and the types check
 * @returns The exit status: 0 once set up, 1 when it failed or what it added does not type-check, 130 when stopped
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
  const installing = run.install !== false;
  const result = await transact(
    {
      root,
      manager: ctx.manager,
      plan,
      install: installing
        ? { when: "before", commands: installCommands(ctx.manager, plan) }
        : undefined,
      afterWrites: installing
        ? async (signal) => {
            await prepare(ctx, plan, io.report, signal);
            const { openapi, name } = ctx.choices;
            if (openapi !== undefined)
              await importSpecification(root, openapi, name, signal, io.toolOutput);
          }
        : undefined,
    },
    io,
  );
  if (typeof result === "number") return result;
  if (!installing) {
    io.report.end({ kind: "install-left", plan, commands: installCommands(ctx.manager, plan) });
    return 0;
  }
  const touched: Touched = { added: result.written, changed: changedByEdits(plan.edits) };
  const outcome = await typecheckTouched(root, touched);
  io.report.typechecked(outcome);
  if (outcome.kind === "errors") {
    io.report.end({ kind: "typecheck-failed" });
    return 1;
  }
  io.report.end({ kind: "applied", plan, said: done });
  return 0;
}
