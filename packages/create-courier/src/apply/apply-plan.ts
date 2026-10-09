import type { Terminal } from "../add-courier";
import type { CreateRun } from "../create-run";
import { changedLines } from "../edit/line-diff";
import type { Plan, PlannedEdit } from "../plan/build-plan";
import { manualLines, nextLines } from "../plan/plan-lines";
import type { RecipeContext } from "../recipes/recipe-types";
import { prepare, reportTypes, writeAfterImport } from "./after-install";
import { importSpecification } from "./import-specification";
import { install, installCommands } from "./install";
import type { Touched } from "./typecheck";
import { checkEditsCurrent, writePlannedEdits, writePlannedFiles } from "./write-plan";

/* What is left to the person, and what to run next. */
function closingLines(plan: Plan, terminal: Terminal): string[] {
  return [
    ...(plan.manual.length > 0
      ? ["", "Left to you", ...plan.manual.flatMap((step) => manualLines(step, terminal.style))]
      : []),
    "",
    "Next",
    ...nextLines(plan.next, terminal.style),
  ];
}

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
  terminal: Terminal,
): Promise<number> {
  const commands = installCommands(ctx.manager, plan);
  if (run.install === false) {
    terminal.print([
      "",
      "Install the packages to finish:",
      ...commands.map((command) => `  ${command.join(" ")}`),
    ]);
    return 0;
  }
  await install(ctx.project.root, commands);
  await prepare(ctx, plan, terminal);
  if (run.openapi !== undefined) {
    const status = await importSpecification(ctx.project.root, run.openapi, run.name);
    if (status !== 0) return status;
    const after = writeAfterImport(ctx.project.root, plan, terminal);
    return reportTypes(
      ctx.project.root,
      { ...touched, added: [...touched.added, ...after] },
      terminal,
    );
  }
  return reportTypes(ctx.project.root, touched, terminal);
}

/**
 * Carry a plan out: write its files, scripts and changes, install its
 * packages — or name the commands with `--no-install` — import the
 * specification if one was given, check the types of what it added and
 * changed, and say what is left to the person and what to run next.
 *
 * @param ctx - The project, and what is set up in it
 * @param plan - The plan the person agreed to
 * @param run - What the command line asked for
 * @param terminal - Where to write
 * @returns The exit status: 0 once set up, 1 when what it added does not type-check
 * @example
 * ```ts
 * return applyPlan(ctx, plan, run, terminal);
 * ```
 */
export async function applyPlan(
  ctx: RecipeContext,
  plan: Plan,
  run: CreateRun,
  terminal: Terminal,
): Promise<number> {
  const { root } = ctx.project;
  checkEditsCurrent(root, plan.edits);
  const written = writePlannedFiles(root, plan.files);
  const edited = writePlannedEdits(root, plan.edits);
  const files = `${written.length} ${written.length === 1 ? "file" : "files"}`;
  const changes = edited.length > 0 ? `, and changed ${edited.join(", ")}` : "";
  terminal.print(["", `Wrote ${files}${changes}.`]);
  const touched: Touched = { added: written, changed: changedByEdits(plan.edits) };
  const status = await installAndCheck(ctx, plan, run, touched, terminal);
  if (status !== 0) return status;
  const done = run.install === false ? [] : ["", terminal.style.green("Courier is set up.")];
  terminal.print([...done, ...closingLines(plan, terminal)]);
  return 0;
}
