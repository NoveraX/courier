import type { Undone } from "../apply/file-journal";
import type { FailureCode } from "../apply/setup-failure";
import type { TypecheckOutcome } from "../apply/typecheck";
import type { Plan } from "../plan/build-plan";
import type { GitState } from "../preflight/git-state";
import type { ConfiguredSources } from "../project/configured-sources";
import type { NextStep } from "../recipes/recipe-types";

/** A package of the project's, as an upgrade moves it in one of its manifests. */
export interface UpgradedPackage {
  /** The manifest, relative to the root: `package.json`, `apps/web/package.json`. */
  readonly manifest: string;
  readonly name: string;
  /** The field that lists it: `dependencies`, `devDependencies`, `peerDependencies` or `optionalDependencies`. */
  readonly field: string;
  /** Its range, as written. */
  readonly from: string;
  /** Its range as the upgrade writes it; `undefined` where it is left as written. */
  readonly to: string | undefined;
  /** Why it is left as written, where it is. */
  readonly why?: string | undefined;
  /** Whether the upgrade adds it: code it changed imports it. */
  readonly added?: boolean | undefined;
}

/** A breaking change of a release an upgrade crosses, and where its notes say what to write instead. */
export interface UpgradeNote {
  readonly release: string;
  readonly title: string;
  readonly docs: string;
}

/** What an upgrade shows beside its plan: the release it moves from and to, each package's range, and the breaking changes it crosses. */
export interface UpgradeView {
  readonly from: string;
  readonly to: string;
  readonly packages: readonly UpgradedPackage[];
  readonly notes: readonly UpgradeNote[];
}

/** The plan, as a run shows it before anything is asked or changed. */
export interface PlanView {
  /** Its first line: what is set up where, with what. */
  readonly title: string;
  readonly plan: Plan;
  /** The APIs the project's config declares already, where it declares any. */
  readonly configured?: ConfiguredSources | undefined;
  /** What git says of the project's changes; none for a project the run created. */
  readonly git?: GitState | undefined;
  /** What an upgrade moves, where the plan is one. */
  readonly upgrade?: UpgradeView | undefined;
}

/** A new project, as a run that creates one shows it before it makes anything. */
export interface NewProjectView {
  readonly name: string;
  /** The framework, as its users name it. */
  readonly framework: string;
  /** How it is made: the generator's command, or the command's own template. */
  readonly how: string;
}

/** What a run wrote. */
export interface WrittenView {
  /** The files it added, relative to the project's root. */
  readonly written: readonly string[];
  /** The files of the project's it changed. */
  readonly changed: readonly string[];
}

/** How a run ended, said once at its end. */
export type SetupEnd =
  /** Nothing was for the run to change: what it says, and what to run where it says. */
  | { readonly kind: "unchanged"; readonly said: string; readonly next: readonly NextStep[] }
  /** The plan was shown, and the run asked to change nothing. */
  | { readonly kind: "dry-run" }
  /** The run changed nothing: the person said no, or nobody could answer. */
  | { readonly kind: "refused"; readonly code: RefusalCode; readonly said: string }
  /** The files are written and the packages are left to the person: the commands that install them. */
  | { readonly kind: "install-left"; readonly plan: Plan; readonly commands: readonly string[][] }
  /** It is set up: what the run says, and what is left to the person and to run next. */
  | { readonly kind: "applied"; readonly plan: Plan; readonly said: string }
  /** What was added does not type-check. */
  | { readonly kind: "typecheck-failed" }
  /** The run stopped part way: why, and what undoing it did. */
  | {
      readonly kind: "failed";
      readonly code: FailureCode;
      /** What stopped it, in a sentence without its full stop. */
      readonly said: string;
      readonly undone: Undone;
      /** The command that puts node_modules back as the lockfile says, where an install had begun. */
      readonly reinstall?: string | undefined;
      /** The error itself, where it was none the run expected: its stack is shown. */
      readonly error?: Error | undefined;
    };

/** Why a run changed nothing. */
export type RefusalCode = "CONFIRMATION_REQUIRED" | "DECLINED" | "GIT_DIRTY";

/**
 * Where a run tells what it does, as it does it: lines for a person, or
 * one JSON document for a program. A run reports its plan first, each
 * step as it is done, and how it ended last.
 */
export interface SetupReport {
  /** A new project about to be made. */
  newProject(view: NewProjectView): void;
  /** What was put right in a new project, or done to it, in the person's words. */
  note(lines: readonly string[]): void;
  plan(view: PlanView): void;
  /** The install ran, with these commands, and held. */
  installed(commands: ReadonlyArray<readonly string[]>): void;
  wrote(view: WrittenView): void;
  /** A program that writes the types the added files read failed: what failed, and the line of its output that says why. */
  prepareFailed(said: string, lines: readonly string[]): void;
  typechecked(outcome: TypecheckOutcome): void;
  end(end: SetupEnd): void;
}
