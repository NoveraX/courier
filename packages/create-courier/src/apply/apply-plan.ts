import type { CreateRun } from "../create-run";
import { changedLines } from "../edit/line-diff";
import type { Plan, PlannedEdit } from "../plan/build-plan";
import type { RecipeContext } from "../recipes/recipe-types";
import type { SetupIO } from "../setup-io";
import { prepare } from "./after-install";
import { FileJournal } from "./file-journal";
import { importSpecification } from "./import-specification";
import { install, installCommands } from "./install";
import { interruptible } from "./interruptible";
import { type ManifestSnapshot, snapshotManifests } from "./manifest-snapshot";
import { SetupFailure } from "./setup-failure";
import { type Touched, typecheckTouched } from "./typecheck";
import { checkEditsCurrent, writePlan } from "./write-plan";

/* The exit status of a run the person stopped with Ctrl+C, as a shell gives a command it interrupts. */
const CANCELLED_STATUS = 130;

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

/* Undo what the run did — its files, then package.json and the lockfile as the install left them — and say how it ended. */
function undoAfter(
  error: unknown,
  journal: FileJournal,
  snapshot: ManifestSnapshot | undefined,
  ctx: RecipeContext,
  io: SetupIO,
): number {
  const files = journal.undo();
  const manifests = snapshot?.restore() ?? { removed: [], putBack: [], kept: [] };
  const failure = error instanceof SetupFailure ? error : undefined;
  const code = failure?.code ?? "UNEXPECTED_ERROR";
  io.report.end({
    kind: "failed",
    code,
    said: error instanceof Error ? error.message : String(error),
    undone: {
      removed: [...files.removed, ...manifests.removed],
      putBack: [...files.putBack, ...manifests.putBack],
      kept: [...files.kept, ...manifests.kept],
    },
    reinstall: snapshot === undefined ? undefined : ctx.manager.install().join(" "),
    error: failure === undefined && error instanceof Error ? error : undefined,
  });
  return code === "CANCELLED" ? CANCELLED_STATUS : 1;
}

/* The changes that undo together: install, write, the programs that follow, the import. Their status, or nothing once they all hold. */
function transaction(
  ctx: RecipeContext,
  plan: Plan,
  run: CreateRun,
  io: SetupIO,
  journal: FileJournal,
): Promise<number | undefined> {
  const { root } = ctx.project;
  return interruptible(async (signal) => {
    let snapshot: ManifestSnapshot | undefined;
    try {
      checkEditsCurrent(root, plan.edits);
      if (run.install !== false) {
        snapshot = snapshotManifests(root);
        await install(root, installCommands(ctx.manager, plan), signal);
      }
      writePlan(journal, root, plan);
      io.report.wrote({ written: journal.written, changed: journal.changed });
      if (run.install === false) return undefined;
      await prepare(ctx, plan, io.report, signal);
      if (run.openapi !== undefined) await importSpecification(root, run.openapi, run.name, signal);
      if (signal.aborted) throw new SetupFailure("CANCELLED", "The setup was cancelled");
      return undefined;
    } catch (error) {
      return undoAfter(error, journal, snapshot, ctx, io);
    }
  });
}

/**
 * Carry a plan out as one transaction: install its packages first — or,
 * with `--no-install`, name the commands — then write its files and its
 * changes, run what writes the types they read, and import the
 * specification if one was given. When any of it fails, or the person
 * stops it with Ctrl+C, what it did is undone: its files removed and put
 * back, and package.json and the lockfile as they were before the
 * install. Once it holds, the types of what it added and changed are
 * checked, and the person is told what is left to them and what to run.
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
  const journal = new FileJournal(ctx.project.root);
  const status = await transaction(ctx, plan, run, io, journal);
  if (status !== undefined) return status;
  if (run.install === false) {
    io.report.end({ kind: "install-left", plan, commands: installCommands(ctx.manager, plan) });
    return 0;
  }
  const touched: Touched = { added: journal.written, changed: changedByEdits(plan.edits) };
  const outcome = await typecheckTouched(ctx.project.root, touched);
  io.report.typechecked(outcome);
  if (outcome.kind === "errors") {
    io.report.end({ kind: "typecheck-failed" });
    return 1;
  }
  io.report.end({ kind: "applied", plan, said: done });
  return 0;
}
