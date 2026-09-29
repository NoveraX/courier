import { DRAFT_LIMITS } from "./draft-limits";
import { suggestMockKey } from "./suggest-mock-key";
import type { MockDraft, MockWizardState, WizardMode } from "./types";
import { UNPLANNED } from "./unplanned";
import type { DeclareApplyResult, DeclarePreview, MockDeclaration } from "./wire-types";
import { withApplyResult } from "./with-apply-result";
import { withPreview } from "./with-preview";

export type MockWizardAction =
  | { type: "open" }
  | { type: "setMode"; mode: WizardMode }
  | { type: "toggleSource"; source: string; declaredKeys: readonly string[] }
  | { type: "editDraft"; index: number; patch: Partial<Omit<MockDraft, "source">> }
  | { type: "removeDraft"; index: number }
  | { type: "goTo"; step: "source" | "configure" }
  | { type: "previewRequested"; requestId: number; mocks: MockDeclaration[] }
  | { type: "previewReceived"; requestId: number; outcome: DeclarePreview; at: number }
  | { type: "previewFailed"; requestId: number; message: string }
  | { type: "applyStarted"; at: number }
  | { type: "applyFinished"; result: DeclareApplyResult; at: number }
  | { type: "applyFailed"; message: string };

export const INITIAL_WIZARD_STATE: MockWizardState = {
  mode: "sources",
  step: "source",
  drafts: [],
  serverErrors: new Map(),
  requestProblems: [],
  ...UNPLANNED,
};

function draftFor(source: string, taken: readonly string[]): MockDraft {
  const key = suggestMockKey(source, taken);
  const seedCountText = String(DRAFT_LIMITS.defaultSeedCount);
  return { source, key, portMode: "auto", portText: "", seedCountText, autoStart: true };
}

function toggled(
  state: MockWizardState,
  source: string,
  declared: readonly string[],
): MockWizardState {
  const without = state.drafts.filter((draft) => draft.source !== source);
  const taken = [...declared, ...state.drafts.map((draft) => draft.key)];
  const drafts =
    without.length < state.drafts.length ? without : [...without, draftFor(source, taken)];
  return { ...state, ...UNPLANNED, drafts, serverErrors: new Map(), requestProblems: [] };
}

function edited(state: MockWizardState, index: number, patch: Partial<MockDraft>): MockWizardState {
  const current = state.drafts[index];
  if (current === undefined) return state;
  const drafts = state.drafts.map((draft, at) => (at === index ? { ...draft, ...patch } : draft));
  const serverErrors = new Map(state.serverErrors);
  serverErrors.delete(index);
  return { ...state, ...UNPLANNED, drafts, serverErrors, requestProblems: [] };
}

/* Positions shift when a draft goes, so Studio's errors, placed by position,
   go too; with the last draft gone there is nothing to configure, and the
   sources are picked again. */
function removed(state: MockWizardState, index: number): MockWizardState {
  const drafts = state.drafts.filter((_, at) => at !== index);
  const step = drafts.length === 0 ? "source" : state.step;
  return { ...state, ...UNPLANNED, step, drafts, serverErrors: new Map(), requestProblems: [] };
}

function wentTo(state: MockWizardState, step: "source" | "configure"): MockWizardState {
  if (step === "configure" && (state.mode !== "sources" || state.drafts.length === 0)) return state;
  return { ...state, ...UNPLANNED, step };
}

/* The plan on screen, or the one a preview still on its way replaces: a
   change can come while the preview asked for after another is in flight. */
function shownDigest({ plan }: MockWizardState): string | null {
  if (plan.status === "ready") return plan.outcome.planDigest;
  return plan.status === "loading" ? plan.previousDigest : null;
}

function requested(
  state: MockWizardState,
  requestId: number,
  mocks: MockDeclaration[],
): MockWizardState {
  if (state.mode !== "sources" || state.step === "source" || mocks.length === 0) return state;
  const previousDigest = shownDigest(state);
  const plan = { status: "loading", requestId, mocks, previousDigest } as const;
  return { ...state, step: "review", plan, apply: { status: "idle" } };
}

function isAnswerTo(state: MockWizardState, requestId: number): boolean {
  return state.plan.status === "loading" && state.plan.requestId === requestId;
}

function whileApplying(state: MockWizardState, action: MockWizardAction): MockWizardState {
  if (action.type === "applyFinished") return withApplyResult(state, action.result, action.at);
  if (action.type === "applyFailed")
    return { ...state, apply: { status: "failed", message: action.message } };
  return state;
}

function onPlan(state: MockWizardState, action: MockWizardAction): MockWizardState {
  switch (action.type) {
    case "previewRequested":
      return requested(state, action.requestId, action.mocks);
    case "previewReceived": {
      if (state.plan.status !== "loading" || !isAnswerTo(state, action.requestId)) return state;
      return withPreview(
        state,
        action.outcome,
        state.plan.mocks,
        state.plan.previousDigest,
        action.at,
      );
    }
    case "previewFailed":
      if (!isAnswerTo(state, action.requestId)) return state;
      return { ...state, plan: { status: "failed", message: action.message } };
    case "applyStarted":
      if (state.plan.status !== "ready" || state.apply.status !== "idle") return state;
      if (action.at < state.plan.armedAt) return state;
      return { ...state, apply: { status: "applying" } };
    default:
      return state;
  }
}

function onDrafts(state: MockWizardState, action: MockWizardAction): MockWizardState {
  switch (action.type) {
    case "setMode":
      return state.step === "source" ? { ...state, ...UNPLANNED, mode: action.mode } : state;
    case "toggleSource":
      return state.step === "source" ? toggled(state, action.source, action.declaredKeys) : state;
    case "editDraft":
      return state.step === "configure" ? edited(state, action.index, action.patch) : state;
    case "removeDraft":
      return state.step === "configure" ? removed(state, action.index) : state;
    case "goTo":
      return wentTo(state, action.step);
    default:
      return onPlan(state, action);
  }
}

/**
 * The mock wizard's state after an action. Pure: every rule the wizard
 * relies on is here. While an apply is in flight only its outcome is taken,
 * not even a fresh start; once the mocks are added only a fresh start is; an answer to any preview
 * but the latest asked for is dropped; editing, picking or dropping a draft
 * forgets the plan, so no diff is shown for drafts it was not made from; an
 * apply starts only from a ready plan, never by itself, and not from a
 * click that came before the plan had been on screen for a moment.
 *
 * @param state - The wizard now
 * @param action - What happened
 * @returns The wizard after it; the same object when the action does not apply
 *
 * @example
 * ```ts
 * const next = mockWizardReducer(INITIAL_WIZARD_STATE, { type: "toggleSource", source: "api", declaredKeys: [] });
 * next.drafts; // → [{ source: "api", key: "api", portMode: "auto", portText: "", seedCountText: "20", autoStart: true }]
 * ```
 */
export function mockWizardReducer(
  state: MockWizardState,
  action: MockWizardAction,
): MockWizardState {
  if (state.apply.status === "applying") return whileApplying(state, action);
  if (action.type === "open") return INITIAL_WIZARD_STATE;
  if (state.step === "done") return state;
  return onDrafts(state, action);
}
