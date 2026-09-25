/**
 * The mock wizard's state after each thing that can happen: picking and
 * editing drafts, the standalone mode, and every outcome of a preview and
 * of an apply. The reducer is pure, so each test starts from a state and
 * checks the one it leads to.
 */
import { describe, expect, it } from "vitest";

import type { MockWizardState } from "../src/views/mocks/wizard/types";
import type {
  DeclareApplyResult,
  ManualOutcome,
  MockDeclaration,
  ReadyOutcome,
} from "../src/views/mocks/wizard/wire-types";
import type { MockWizardAction } from "../src/views/mocks/wizard/wizard-reducer";

import { INITIAL_WIZARD_STATE, mockWizardReducer } from "../src/views/mocks/wizard/wizard-reducer";

const MOCKS: MockDeclaration[] = [{ key: "api", source: "api", port: null, seedCount: 20, autoStart: true }];
const READY: ReadyOutcome = {
  status: "ready",
  target: "courier.mocks.ts",
  creates: true,
  baseHash: null,
  planDigest: "b".repeat(64),
  hunks: [{ lines: [{ kind: "add", text: "export default defineMocks({", oldLine: null, newLine: 1 }] }],
  warnings: [],
};
const MANUAL: ManualOutcome = {
  status: "manual",
  target: "courier.mocks.ts",
  creates: false,
  reasons: [{ code: "MOCKS_LOAD_FAILING", source: null, message: "courier.mocks.ts does not load" }],
  snippet: "api: defineMockServer({ source: courierConfig.sources.api }),",
  retryable: true,
};
/* When the plan appeared, when the user clicked to apply it well after, and when Studio answered. */
const SHOWN = 1_000;
const CLICKED = SHOWN + 60_000;
const ANSWERED = CLICKED + 100;
const INSERTED = [{ line: 3, text: "  api: defineMockServer({ source }),", added: "  api: defineMockServer({ source })," }];

function run(state: MockWizardState, ...actions: MockWizardAction[]): MockWizardState {
  return actions.reduce(mockWizardReducer, state);
}

function configured(): MockWizardState {
  return run(
    INITIAL_WIZARD_STATE,
    { type: "toggleSource", source: "api", declaredKeys: [] },
    { type: "goTo", step: "configure" },
  );
}

function reviewing(): MockWizardState {
  return run(
    configured(),
    { type: "previewRequested", requestId: 1, mocks: MOCKS },
    { type: "previewReceived", requestId: 1, outcome: READY, at: SHOWN },
  );
}

function applied(result: DeclareApplyResult): MockWizardState {
  return run(reviewing(), { type: "applyStarted", at: CLICKED }, { type: "applyFinished", result, at: ANSWERED });
}

describe("drafts", () => {
  it("picks a source with a free key and the defaults, and drops it when picked again", () => {
    const picked = run(INITIAL_WIZARD_STATE, { type: "toggleSource", source: "api", declaredKeys: ["API"] });

    expect(picked.drafts).toEqual([
      { source: "api", key: "apiMock", portMode: "auto", portText: "", seedCountText: "20", autoStart: true },
    ]);
    expect(run(picked, { type: "toggleSource", source: "api", declaredKeys: [] }).drafts).toEqual([]);
  });

  it("keeps the standalone mode, from which the wizard does not go on, and keeps the drafts across it", () => {
    const picked = run(INITIAL_WIZARD_STATE, { type: "toggleSource", source: "api", declaredKeys: [] });
    const standalone = run(picked, { type: "setMode", mode: "standalone" });

    expect(standalone.mode).toBe("standalone");
    expect(run(standalone, { type: "goTo", step: "configure" }).step).toBe("source");
    const back = run(standalone, { type: "setMode", mode: "sources" }, { type: "goTo", step: "configure" });
    expect(back.step).toBe("configure");
    expect(back.drafts).toEqual(picked.drafts);
  });

  it("goes back to picking sources once the last draft is removed, there being nothing left to configure", () => {
    const two = run(
      INITIAL_WIZARD_STATE,
      { type: "toggleSource", source: "api", declaredKeys: [] },
      { type: "toggleSource", source: "billing", declaredKeys: [] },
      { type: "goTo", step: "configure" },
    );

    const one = run(two, { type: "removeDraft", index: 0 });
    expect(one.step).toBe("configure");
    expect(one.drafts.map((draft) => draft.source)).toEqual(["billing"]);

    const none = run(one, { type: "removeDraft", index: 0 });
    expect(none.drafts).toEqual([]);
    expect(none.step).toBe("source");
  });

  it("forgets the plan and the draft's errors from Studio once the draft is edited", () => {
    const refused = run(configured(), { type: "previewRequested", requestId: 1, mocks: MOCKS }, {
      type: "previewReceived",
      requestId: 1,
      at: SHOWN,
      outcome: { status: "invalid", errors: [{ index: 0, source: "api", field: "key", message: "taken" }] },
    });
    expect(refused.serverErrors.get(0)).toEqual({ key: "taken" });

    const edited = run(refused, { type: "editDraft", index: 0, patch: { key: "apiMock" } });

    expect(edited.drafts[0]?.key).toBe("apiMock");
    expect(edited.serverErrors.size).toBe(0);
    expect(edited.plan).toEqual({ status: "idle" });
  });
});

describe("preview outcomes", () => {
  it("shows a ready plan, with the declarations it answers", () => {
    const state = reviewing();

    expect(state.step).toBe("review");
    expect(state.plan).toEqual({ status: "ready", outcome: READY, mocks: MOCKS, changedOnDisk: false, armedAt: expect.any(Number) });
  });

  it("shows a manual outcome", () => {
    const state = run(configured(), { type: "previewRequested", requestId: 1, mocks: MOCKS }, {
      type: "previewReceived",
      requestId: 1,
      at: SHOWN,
      outcome: MANUAL,
    });

    expect(state.plan).toEqual({ status: "manual", outcome: MANUAL });
  });

  it("returns to the drafts with each error on its draft, and an error that names no draft sent above them", () => {
    const state = run(configured(), { type: "previewRequested", requestId: 1, mocks: MOCKS }, {
      type: "previewReceived",
      requestId: 1,
      at: SHOWN,
      outcome: {
        status: "invalid",
        errors: [
          { index: 0, source: "api", field: "port", message: "port 6280 is Studio's own" },
          { index: 3, source: "billing", field: "source", message: "courier.config has no sources.billing" },
        ],
      },
    });

    expect(state.step).toBe("configure");
    expect(state.serverErrors).toEqual(new Map([[0, { port: "port 6280 is Studio's own" }]]));
    expect(state.requestProblems).toEqual(["billing: courier.config has no sources.billing"]);
  });

  it("shows a request that failed", () => {
    const state = run(configured(), { type: "previewRequested", requestId: 1, mocks: MOCKS }, {
      type: "previewFailed",
      requestId: 1,
      message: "Failed to fetch",
    });

    expect(state.plan).toEqual({ status: "failed", message: "Failed to fetch" });
  });

  it("drops an answer to a preview asked for before the latest one", () => {
    const state = run(
      configured(),
      { type: "previewRequested", requestId: 1, mocks: MOCKS },
      { type: "previewRequested", requestId: 2, mocks: MOCKS },
      { type: "previewReceived", requestId: 1, outcome: READY, at: SHOWN },
    );

    expect(state.plan).toMatchObject({ status: "loading", requestId: 2 });
  });

  it("says the plan changed when the project changed it", () => {
    const newer = { ...READY, planDigest: "c".repeat(64) };
    const state = run(reviewing(), { type: "previewRequested", requestId: 2, mocks: MOCKS }, {
      type: "previewReceived",
      requestId: 2,
      at: SHOWN,
      outcome: newer,
    });

    expect(state.plan).toEqual({ status: "ready", outcome: newer, mocks: MOCKS, changedOnDisk: true, armedAt: expect.any(Number) });
  });

  it("still says the plan changed when a second change comes while the first new plan is on its way", () => {
    const newer = { ...READY, planDigest: "c".repeat(64) };
    const state = run(
      reviewing(),
      { type: "previewRequested", requestId: 2, mocks: MOCKS },
      { type: "previewRequested", requestId: 3, mocks: MOCKS },
      { type: "previewReceived", requestId: 3, outcome: newer, at: SHOWN },
    );

    expect(state.plan).toEqual({ status: "ready", outcome: newer, mocks: MOCKS, changedOnDisk: true, armedAt: expect.any(Number) });
  });
});

describe("apply outcomes", () => {
  it("starts only from a ready plan, and takes nothing but its outcome meanwhile", () => {
    expect(run(configured(), { type: "applyStarted", at: CLICKED }).apply).toEqual({ status: "idle" });

    const applying = run(reviewing(), { type: "applyStarted", at: CLICKED });
    expect(applying.apply).toEqual({ status: "applying" });
    for (const action of [
      { type: "open" },
      { type: "goTo", step: "configure" },
      { type: "previewRequested", requestId: 9, mocks: MOCKS },
    ] satisfies MockWizardAction[]) {
      expect(run(applying, action)).toBe(applying);
    }
  });

  it("does not take a click that comes as the plan appears, such as the second click of a double click", () => {
    const state = reviewing();

    expect(run(state, { type: "applyStarted", at: SHOWN })).toBe(state);
    expect(state.plan.status === "ready" && state.plan.armedAt > SHOWN).toBe(true);
    const armedAt = state.plan.status === "ready" ? state.plan.armedAt : Number.NaN;
    expect(run(state, { type: "applyStarted", at: armedAt - 1 })).toBe(state);
    expect(run(state, { type: "applyStarted", at: armedAt }).apply).toEqual({ status: "applying" });
  });

  it("does not take a click that comes as the new plan of a stale answer appears", () => {
    const state = applied({ status: "stale", plan: { ...READY, planDigest: "c".repeat(64) } });

    expect(state.plan.status).toBe("ready");
    expect(run(state, { type: "applyStarted", at: ANSWERED })).toBe(state);
    expect(run(state, { type: "applyStarted", at: ANSWERED + 60_000 }).apply).toEqual({ status: "applying" });
  });

  it("ends the wizard once the mocks are added, and only a fresh start is taken then", () => {
    const state = applied({ status: "applied", target: "courier.mocks.ts", keys: ["api"], warnings: ["w"] });

    expect(state.step).toBe("done");
    expect(state.apply).toEqual({ status: "applied", target: "courier.mocks.ts", keys: ["api"], warnings: ["w"], at: ANSWERED });
    expect(run(state, { type: "goTo", step: "configure" })).toBe(state);
    expect(run(state, { type: "open" })).toBe(INITIAL_WIZARD_STATE);
  });

  it("shows the new plan to confirm again when the file changed since the preview, and never applies it", () => {
    const fresh = { ...READY, creates: false, baseHash: "a".repeat(64), planDigest: "c".repeat(64) };
    const state = applied({ status: "stale", plan: fresh });

    expect(state.plan).toEqual({ status: "ready", outcome: fresh, mocks: MOCKS, changedOnDisk: true, armedAt: expect.any(Number) });
    expect(state.apply).toEqual({ status: "idle" });
  });

  it("shows a stale answer whose new plan is manual or refuses the values as a preview's would", () => {
    expect(applied({ status: "stale", plan: MANUAL }).plan).toEqual({ status: "manual", outcome: MANUAL });
    const refused = applied({
      status: "stale",
      plan: { status: "invalid", errors: [{ index: 0, source: "api", field: "key", message: "taken" }] },
    });
    expect(refused.step).toBe("configure");
    expect(refused.serverErrors.get(0)).toEqual({ key: "taken" });
  });

  it("returns to the drafts when the apply refuses the values", () => {
    const state = applied({ status: "invalid", errors: [{ index: 0, source: "api", field: "seedCount", message: "no" }] });

    expect(state.step).toBe("configure");
    expect(state.serverErrors.get(0)).toEqual({ seedCount: "no" });
  });

  it("shows a manual answer to an apply as a preview's manual outcome", () => {
    const busy = { ...MANUAL, reasons: [{ code: "STUDIO_BUSY" as const, source: null, message: "busy" }] };
    const state = applied(busy);

    expect(state.plan).toEqual({ status: "manual", outcome: busy });
    expect(state.apply).toEqual({ status: "idle" });
  });

  it("keeps an edit Studio took back, or could not take back, as Studio told it", () => {
    const outcomes: DeclareApplyResult[] = [
      { status: "rolledBack", target: "courier.mocks.ts", creates: true, reason: "did not load", snippet: "x" },
      { status: "notVerified", target: "courier.mocks.ts", reason: "did not load", insertedLines: INSERTED },
      { status: "rollbackFailed", target: "courier.mocks.ts", reason: "EACCES", insertedLines: INSERTED },
    ];
    for (const outcome of outcomes) {
      const state = applied(outcome);
      expect(state.step).toBe("review");
      expect(state.apply).toEqual(outcome);
    }
  });

  it("shows an apply that got no answer, and asks for a new plan rather than sending it again", () => {
    const failed = run(reviewing(), { type: "applyStarted", at: CLICKED }, { type: "applyFailed", message: "Failed to fetch" });

    expect(failed.apply).toEqual({ status: "failed", message: "Failed to fetch" });
    expect(run(failed, { type: "applyStarted", at: CLICKED })).toBe(failed);
    const again = run(failed, { type: "previewRequested", requestId: 2, mocks: MOCKS });
    expect(again.plan).toMatchObject({ status: "loading", requestId: 2 });
    expect(again.apply).toEqual({ status: "idle" });
  });
});
