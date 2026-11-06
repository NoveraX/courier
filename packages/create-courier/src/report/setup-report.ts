import type { TypecheckOutcome } from "../apply/typecheck";
import type { Plan } from "../plan/build-plan";
import type { ConfiguredSources } from "../project/configured-sources";
import type { NextStep } from "../recipes/recipe-types";

/** The plan, as a run shows it before anything is asked or changed. */
export interface PlanView {
  /** Its first line: what is set up where, with what. */
  readonly title: string;
  readonly plan: Plan;
  /** The APIs the project's config declares already, where it declares any. */
  readonly configured?: ConfiguredSources | undefined;
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
  | { readonly kind: "typecheck-failed" };

/** Why a run changed nothing. */
export type RefusalCode = "CONFIRMATION_REQUIRED" | "DECLINED";

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
  wrote(view: WrittenView): void;
  /** A program that writes the types the added files read failed: what failed, and its last lines. */
  prepareFailed(said: string, lines: readonly string[]): void;
  typechecked(outcome: TypecheckOutcome): void;
  end(end: SetupEnd): void;
}
