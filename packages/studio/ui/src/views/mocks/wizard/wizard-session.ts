import type { DeclareClient } from "./declare-client";
import { toDeclarations } from "./to-declarations";
import type { MockWizardState } from "./types";
import type { MockDeclaration } from "./wire-types";
import type { MockWizardAction } from "./wizard-reducer";
import { INITIAL_WIZARD_STATE, mockWizardReducer } from "./wizard-reducer";

/** The wizard's state, and what the user and the project do to it. */
export interface WizardSession {
  getState(): MockWizardState;
  subscribe(listener: () => void): () => void;
  dispatch(action: MockWizardAction): void;
  /** Ask Studio for the plan of the drafts as they are. */
  review(): void;
  /**
   * Apply the ready plan shown; nothing when there is none, one is being
   * applied, or the plan has not been on screen for a moment yet.
   */
  apply(): void;
  /** The project Studio runs changed: a plan shown may be out of date, so it is asked for again. */
  projectChanged(): void;
}

export interface WizardSessionOptions {
  client: DeclareClient;
  /** Epoch milliseconds, for when an answer arrived and when an apply was asked for. */
  now?: () => number;
  /** Where a failed request is reported besides the wizard. */
  log?: Pick<Console, "error">;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* A plan on screen, or one on its way, may describe a project that is no
   longer there; an apply's outcome is the user's to read, so it stays. */
function showsPlan({ step, plan, apply }: MockWizardState): boolean {
  if (step !== "review" || apply.status !== "idle") return false;
  return plan.status === "ready" || plan.status === "manual" || plan.status === "loading";
}

/**
 * Create the mock wizard's session: its state, kept by `mockWizardReducer`,
 * and the requests to Studio. Each preview gets a request id, so only the
 * answer to the latest one is kept. An apply is sent once per click on a
 * ready plan that has been on screen for a moment: a second click while it
 * is in flight sends nothing, and a failed apply is never sent again —
 * "Check again" asks for a new plan. A request that fails is logged and
 * shown in the wizard.
 *
 * @param options - The client for Studio's routes, a clock and a log
 * @returns The session; React reads it with `useSyncExternalStore`
 *
 * @example
 * ```ts
 * const session = createWizardSession({ client: declareClient });
 * session.dispatch({ type: "toggleSource", source: "api", declaredKeys: [] });
 * session.dispatch({ type: "goTo", step: "configure" });
 * session.review();
 * ```
 */
export function createWizardSession({
  client,
  now = Date.now,
  log = console,
}: WizardSessionOptions): WizardSession {
  let state = INITIAL_WIZARD_STATE;
  let requestSeq = 0;
  const listeners = new Set<() => void>();

  function dispatch(action: MockWizardAction): void {
    const next = mockWizardReducer(state, action);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  }

  async function preview(requestId: number, mocks: MockDeclaration[]): Promise<void> {
    try {
      const outcome = await client.preview(mocks);
      dispatch({ type: "previewReceived", requestId, outcome, at: now() });
    } catch (err) {
      log.error("Studio could not plan adding the mocks", err);
      dispatch({ type: "previewFailed", requestId, message: messageOf(err) });
    }
  }

  function review(): void {
    const mocks = toDeclarations(state.drafts);
    if (mocks === null) return;
    const requestId = ++requestSeq;
    dispatch({ type: "previewRequested", requestId, mocks });
    if (state.plan.status === "loading" && state.plan.requestId === requestId) {
      void preview(requestId, mocks);
    }
  }

  /* The reducer decides whether this click starts the apply; while one is
     in flight it takes nothing but its outcome, so no second one is sent. */
  async function apply(): Promise<void> {
    const before = state;
    if (before.apply.status !== "idle") return;
    dispatch({ type: "applyStarted", at: now() });
    const { plan, apply: started } = state;
    if (started.status !== "applying" || plan.status !== "ready") return;
    const { baseHash, planDigest } = plan.outcome;
    try {
      const result = await client.apply({ mocks: plan.mocks, baseHash, planDigest });
      dispatch({ type: "applyFinished", result, at: now() });
    } catch (err) {
      log.error("Studio could not add the mocks", err);
      dispatch({ type: "applyFailed", message: messageOf(err) });
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch,
    review,
    apply: () => void apply(),
    projectChanged: () => {
      if (showsPlan(state)) review();
    },
  };
}
