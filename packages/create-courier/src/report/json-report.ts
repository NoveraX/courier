import type { Undone } from "../apply/file-journal";
import type { TypecheckOutcome } from "../apply/typecheck";
import { changedLines } from "../edit/line-diff";
import type { DocumentStatus, PlanDocument, SetupDocument } from "./setup-document";
import type { NewProjectView, PlanView, SetupEnd, SetupReport } from "./setup-report";

/** The JSON report: a run's report, and the document it comes to. */
export interface JsonReport extends SetupReport {
  /**
   * Note why the run stopped, where it threw rather than ended.
   *
   * @param status - `refused` where it changed nothing for what it was asked, `failed` where something failed
   * @param code - The reason's code
   * @param message - What the person reads
   */
  stopped(status: "refused" | "failed", code: string, message: string): void;
  /**
   * The document, once the run has ended.
   *
   * @param exitCode - What the command exits with
   * @returns The JSON text, with its line end
   */
  document(exitCode: number): string;
}

function planDocument({ title, plan, configured, git }: PlanView): PlanDocument {
  return {
    title,
    configured: configured
      ? { path: configured.path, apis: configured.names, more: configured.more }
      : null,
    git: git ?? null,
    files: plan.files.map(({ path, state, purpose }) => ({ path, state, purpose })),
    edits: plan.edits.map(({ path, state, purpose, before, after }) => ({
      path,
      state,
      purpose,
      lines: changedLines(before, after),
    })),
    packages: {
      dependencies: plan.dependencies,
      devDependencies: plan.devDependencies,
      typescript: plan.typescript ?? null,
      otherReleases: plan.otherReleases,
      notInstalled: plan.notInstalled,
    },
    manual: plan.manual,
    next: plan.next,
  };
}

/* How each ending reads to a program: its status, and why where it was refused or failed. */
function statusOf(end: SetupEnd | undefined): {
  status: DocumentStatus;
  error: SetupDocument["error"];
} {
  switch (end?.kind) {
    case undefined:
      return { status: "failed", error: null };
    case "unchanged":
    case "dry-run":
      return { status: end.kind, error: null };
    case "install-left":
    case "applied":
      return { status: "applied", error: null };
    case "refused":
      return { status: "refused", error: { code: end.code, message: end.said } };
    case "typecheck-failed":
      return {
        status: "failed",
        error: {
          code: "TYPECHECK_FAILED",
          message: "TypeScript finds errors in what Courier added",
        },
      };
    case "failed":
      return { status: "failed", error: { code: end.code, message: end.said } };
  }
}

/**
 * A run told to a program: everything it reports is kept, and written as
 * one JSON document once it ends — standard output carries nothing else.
 *
 * @param command - The command that runs: `create-courier`, `courier-cli setup`
 * @param version - Its version
 * @returns The report
 * @example
 * ```ts
 * const report = jsonReport("create-courier", "0.5.0");
 * process.stdout.write(report.document(await createCourier(run, { interactive: false, report, toolOutput: "stderr" })));
 * ```
 */
export function jsonReport(command: string, version: string): JsonReport {
  let newProject: NewProjectView | null = null;
  let plan: PlanDocument | null = null;
  const notes: string[] = [];
  let written: readonly string[] = [];
  let changed: readonly string[] = [];
  let install: SetupDocument["install"] = null;
  const warnings: Array<{ message: string; lines: readonly string[] }> = [];
  let typecheck: TypecheckOutcome | null = null;
  let end: SetupEnd | undefined;
  let stopped: { status: "refused" | "failed"; error: NonNullable<SetupDocument["error"]> } | null =
    null;
  return {
    newProject: (view) => {
      newProject = view;
    },
    note: (lines) => notes.push(...lines),
    plan: (view) => {
      plan = planDocument(view);
    },
    installed: (commands) => {
      install = { ran: true, commands };
    },
    wrote: (view) => {
      ({ written, changed } = view);
    },
    prepareFailed: (message, lines) => warnings.push({ message, lines }),
    typechecked: (outcome) => {
      typecheck = outcome;
    },
    end: (ended) => {
      end = ended;
      if (ended.kind === "install-left") install = { ran: false, commands: ended.commands };
    },
    stopped: (status, code, message) => {
      stopped = { status, error: { code, message } };
    },
    document(exitCode) {
      const { status, error } = stopped ?? statusOf(end);
      const undone: Undone | null = end?.kind === "failed" ? end.undone : null;
      const document: SetupDocument = {
        schemaVersion: 1,
        command,
        version,
        status,
        exitCode,
        newProject,
        plan,
        notes,
        written,
        changed,
        install,
        warnings,
        typecheck,
        undone,
        error,
      };
      return `${JSON.stringify(document, null, 2)}\n`;
    },
  };
}
