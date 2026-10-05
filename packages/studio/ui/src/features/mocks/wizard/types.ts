import type {
  AppliedOutcome,
  DeclarationField,
  ManualOutcome,
  MockDeclaration,
  NotVerifiedOutcome,
  ReadyOutcome,
  RollbackFailedOutcome,
  RolledBackOutcome,
} from "./wire-types";

export type WizardStep = "source" | "configure" | "review" | "done";

/** A port Studio assigns, or one typed and held exactly. */
export type PortMode = "auto" | "fixed";

/** Whether a mock answers every endpoint of its source, or the ones picked. */
export type AnswersMode = "all" | "some";

/** Where a mock's answers come from: generated from the schemas, or recorded from the server. */
export type DataMode = "generated" | "recorded";

/** One mock as the user fills it in; numbers stay the text typed until they are sent. */
export interface MockDraft {
  source: string;
  key: string;
  portMode: PortMode;
  portText: string;
  seedCountText: string;
  autoStart: boolean;
  answers: AnswersMode;
  /** The endpoints picked while `answers` is `some`, by name. */
  endpoints: string[];
  data: DataMode;
}

/** What is wrong with each field of one draft. */
export type DraftErrors = { [Field in DeclarationField]?: string | undefined };

/** Studio's plan for the drafts, and the declarations it answers. */
export type PlanState =
  | { status: "idle" }
  | {
      status: "loading";
      requestId: number;
      mocks: MockDeclaration[];
      /** The digest of the plan shown before this one was asked for, if one was. */
      previousDigest: string | null;
    }
  | { status: "failed"; message: string }
  | {
      status: "ready";
      outcome: ReadyOutcome;
      mocks: MockDeclaration[];
      /** Whether the project changed since the plan shown before, so this one differs. */
      changedOnDisk: boolean;
      /**
       * Epoch milliseconds from which a click applies the plan. The plan
       * appears within milliseconds of the click that asked for it, where
       * that button was; a click before this moment — the second click of
       * a double click — was not aimed at a change the user has seen.
       */
      armedAt: number;
    }
  | { status: "manual"; outcome: ManualOutcome };

/** The apply of a ready plan, and what came of it. */
export type ApplyState =
  | { status: "idle" }
  | { status: "applying" }
  /** No readable answer came: Studio may or may not have written the file. */
  | { status: "failed"; message: string }
  | (AppliedOutcome & { at: number })
  | RolledBackOutcome
  | NotVerifiedOutcome
  | RollbackFailedOutcome;

export interface MockWizardState {
  step: WizardStep;
  /** One per picked source, in the order picked. */
  drafts: readonly MockDraft[];
  /** Studio's field errors, by draft position; one is cleared when its draft is edited. */
  serverErrors: ReadonlyMap<number, DraftErrors>;
  /** Studio's field errors that name no draft the wizard sent, shown above the drafts. */
  requestProblems: readonly string[];
  plan: PlanState;
  apply: ApplyState;
}
