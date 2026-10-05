import { isPlainObject } from "@/socket/is-plain-object";
import type { MockDraft, MockWizardState } from "./types";

/** A mock wizard left unfinished: the step it was on, and its drafts. */
export interface KeptWizard {
  step: "source" | "configure";
  drafts: readonly MockDraft[];
}

const MODES = {
  portMode: ["auto", "fixed"],
  answers: ["all", "some"],
  data: ["generated", "recorded"],
} as const;

const isText = (value: unknown): value is string => typeof value === "string";

function draftOf(raw: unknown): MockDraft | undefined {
  if (!isPlainObject(raw)) return undefined;
  const { source, key, portMode, portText, seedCountText, autoStart, answers, endpoints, data } =
    raw;
  if (!isText(source) || !isText(key) || !isText(portText) || !isText(seedCountText))
    return undefined;
  if (typeof autoStart !== "boolean" || !Array.isArray(endpoints) || !endpoints.every(isText)) {
    return undefined;
  }
  const port = MODES.portMode.find((mode) => mode === portMode);
  const answer = MODES.answers.find((mode) => mode === answers);
  const kept = MODES.data.find((mode) => mode === data);
  if (!port || !answer || !kept) return undefined;
  return {
    source,
    key,
    portMode: port,
    portText,
    seedCountText,
    autoStart,
    answers: answer,
    endpoints,
    data: kept,
  };
}

/**
 * The part of a mock wizard worth keeping while it is unfinished: its step
 * and its drafts. A plan or an apply is not kept — a plan is asked for
 * again — and a wizard that is done, or has no drafts, keeps nothing.
 *
 * @param state - The wizard now
 * @returns What to keep, or `null` when there is nothing to
 * @example
 * ```ts
 * keptWizard(session.getState()); // { step: "configure", drafts: [...] }
 * ```
 */
export function keptWizard(state: MockWizardState): KeptWizard | null {
  if (state.step === "done" || state.drafts.length === 0) return null;
  return { step: state.step === "review" ? "configure" : state.step, drafts: state.drafts };
}

/**
 * Read a kept wizard, as the project keeps it.
 *
 * @param raw - What the project keeps
 * @returns The wizard to open where it was left, or `undefined` for none of its shape
 * @example
 * ```ts
 * readKeptWizard({ step: "source", drafts: [] }); // → undefined: no drafts
 * ```
 */
export function readKeptWizard(raw: unknown): KeptWizard | undefined {
  if (!isPlainObject(raw) || (raw.step !== "source" && raw.step !== "configure")) return undefined;
  if (!Array.isArray(raw.drafts)) return undefined;
  const drafts = raw.drafts.map(draftOf).filter((draft) => draft !== undefined);
  return drafts.length > 0 ? { step: raw.step, drafts } : undefined;
}
