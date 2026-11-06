import type { Undone } from "../apply/file-journal";
import type { TypecheckOutcome } from "../apply/typecheck";
import type { ChangedLine } from "../edit/line-diff";
import type { GitState } from "../preflight/git-state";
import type { ManualStep, NextStep } from "../recipes/recipe-types";
import type { UpgradeView } from "./setup-report";

/** The plan, as the JSON document gives it. */
export interface PlanDocument {
  readonly title: string;
  /** The APIs the project's config declares already, where it declares any. */
  readonly configured: {
    readonly path: string;
    readonly apis: readonly string[];
    readonly more: boolean;
  } | null;
  /** What git says of the project's changes; `null` for a project the run created. */
  readonly git: GitState | null;
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly state: "create" | "same" | "courier" | "kept";
    readonly purpose: string;
  }>;
  readonly edits: ReadonlyArray<{
    readonly path: string;
    readonly state: "edit" | "same";
    readonly purpose: string;
    /** The lines the change removes and adds, as the plan shows them. */
    readonly lines: readonly ChangedLine[];
  }>;
  readonly packages: {
    readonly dependencies: readonly string[];
    readonly devDependencies: readonly string[];
    readonly typescript: { readonly from?: string | undefined; readonly to: string } | null;
    readonly otherReleases: ReadonlyArray<{
      readonly name: string;
      readonly has: string;
      readonly wants: string;
    }>;
    readonly notInstalled: readonly string[];
  };
  readonly manual: readonly ManualStep[];
  readonly next: readonly NextStep[];
  /** What the setup leaves out that the person might look for, and why, a sentence each. */
  readonly leftOut: readonly string[];
  /** What an upgrade moves: the releases, each package's range, the breaking changes it crosses; `null` for a setup. */
  readonly upgrade: UpgradeView | null;
}

/** How a run ended, as a program reads it. */
export type DocumentStatus = "applied" | "unchanged" | "dry-run" | "refused" | "failed";

/**
 * What `--json` writes to standard output, once, as the run ends: what it
 * planned and what it did, for a program — a CI job, an agent — to read.
 * Within a `schemaVersion`, fields are only ever added.
 */
export interface SetupDocument {
  readonly schemaVersion: 1;
  /** The command that ran: `create-courier`, or `courier-cli setup`. */
  readonly command: string;
  readonly version: string;
  readonly status: DocumentStatus;
  /** What the command exits with: 0 once it holds, 1 for a refusal or a failure. */
  readonly exitCode: number;
  /** The new project the run created, where it created one. */
  readonly newProject: {
    readonly name: string;
    readonly framework: string;
    readonly how: string;
  } | null;
  readonly plan: PlanDocument | null;
  /** What was put right in a new project, or done to it. */
  readonly notes: readonly string[];
  /** The files the run added, relative to the project's root. */
  readonly written: readonly string[];
  /** The files of the project's it changed. */
  readonly changed: readonly string[];
  /** The install: whether it ran, and its commands — those to run, where it did not. */
  readonly install: {
    readonly ran: boolean;
    readonly commands: ReadonlyArray<readonly string[]>;
  } | null;
  /** Programs that write the types the added files read, which failed: what failed, and their last lines. */
  readonly warnings: ReadonlyArray<{ readonly message: string; readonly lines: readonly string[] }>;
  readonly typecheck: TypecheckOutcome | null;
  /** What undoing a run that failed part way did. */
  readonly undone: Undone | null;
  /** Why it was refused or failed: a code a program can tell apart, and the person's message. */
  readonly error: { readonly code: string; readonly message: string } | null;
}
