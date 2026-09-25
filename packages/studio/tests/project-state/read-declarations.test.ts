/**
 * What a route reads of the import declarations, for what it does with
 * them, in each state of the project Studio runs: a list shows the last
 * good config while the current one does not load, removing an import never
 * waits on the config, and writing an import's files refuses with a reason
 * unless the config loads as it is on disk.
 */
import { describe, expect, it, vi } from "vitest";

import type { LoadedCourierConfig } from "../../src/server/config-loader";
import type { ImportDeclarations } from "../../src/server/imports-bridge";
import { ACT_BUDGET_MS, SHOW_BUDGET_MS } from "../../src/server/project-state/budgets";
import { ProjectUnavailableError } from "../../src/server/project-state/project-unavailable-error";
import {
  type DeclarationsPurpose,
  readDeclarations,
} from "../../src/server/project-state/read-declarations";
import type {
  ConfigFailure,
  FreshSnapshot,
  ProjectReads,
} from "../../src/server/project-state/types";

const ROOT = "/work/app";
const DECLARED: ImportDeclarations = {
  pets: { importType: "file", type: "openapi", outputDir: "src/api" },
};

function running(): LoadedCourierConfig {
  return {
    config: { sources: {}, imports: DECLARED },
    configFile: `${ROOT}/courier.config.ts`,
    contentHash: null,
    deps: [],
    depHashes: new Map(),
    mocks: { file: null, entries: {}, contentHash: null, error: null },
  };
}

function failure(code: ConfigFailure["code"]): ConfigFailure {
  return { code, message: "courier.config.ts: Unexpected token (3:1)", at: 2, cause: new Error("boom") };
}

const BASE: FreshSnapshot = {
  revision: 1,
  starting: false,
  running: null,
  loadedAt: null,
  failure: null,
  settling: false,
};

const STATES: Record<string, FreshSnapshot> = {
  loaded: { ...BASE, running: running(), loadedAt: 1 },
  "fails, loaded before": { ...BASE, running: running(), loadedAt: 1, failure: failure("UNKNOWN") },
  "fails, never loaded": { ...BASE, failure: failure("UNKNOWN") },
  "deleted after a load": { ...BASE, running: running(), loadedAt: 1, failure: failure("CONFIG_NOT_FOUND") },
  "never had one": { ...BASE, failure: failure("CONFIG_NOT_FOUND") },
  "no outcome yet": { ...BASE, revision: 0, starting: true, settling: true },
  "still reloading": { ...BASE, running: running(), loadedAt: 1, settling: true },
};

type Outcome = ImportDeclarations | { status: number; code: string };

const EXPECTED: Record<DeclarationsPurpose, Record<keyof typeof STATES, Outcome>> = {
  show: {
    loaded: DECLARED,
    "fails, loaded before": DECLARED,
    "fails, never loaded": { status: 409, code: "CONFIG_NOT_LOADING" },
    "deleted after a load": DECLARED,
    "never had one": {},
    "no outcome yet": { status: 503, code: "STUDIO_STARTING" },
    "still reloading": DECLARED,
  },
  forget: {
    loaded: DECLARED,
    "fails, loaded before": DECLARED,
    "fails, never loaded": {},
    "deleted after a load": DECLARED,
    "never had one": {},
    "no outcome yet": { status: 503, code: "STUDIO_STARTING" },
    "still reloading": DECLARED,
  },
  act: {
    loaded: DECLARED,
    "fails, loaded before": { status: 409, code: "CONFIG_NOT_LOADING" },
    "fails, never loaded": { status: 409, code: "CONFIG_NOT_LOADING" },
    "deleted after a load": { status: 409, code: "CONFIG_MISSING" },
    "never had one": { status: 409, code: "CONFIG_MISSING" },
    "no outcome yet": { status: 503, code: "STUDIO_STARTING" },
    "still reloading": { status: 503, code: "CONFIG_RELOADING" },
  },
};

function projectAt(view: FreshSnapshot): ProjectReads & { fresh: ReturnType<typeof vi.fn> } {
  return { snapshot: () => view, fresh: vi.fn(async () => view) };
}

async function outcomeOf(view: FreshSnapshot, purpose: DeclarationsPurpose): Promise<Outcome> {
  try {
    return await readDeclarations(projectAt(view), ROOT, purpose);
  } catch (err) {
    if (err instanceof ProjectUnavailableError) return { status: err.httpStatus, code: err.code };
    throw err;
  }
}

const CASES = (["show", "forget", "act"] as const).flatMap((purpose) =>
  Object.keys(STATES).map((state) => [purpose, state] as const),
);

describe("readDeclarations", () => {
  it.each(CASES)("for %s, when courier.config is %s", async (purpose, state) => {
    const view = STATES[state];
    if (!view) throw new Error(`No state named ${state}`);

    const outcome = await outcomeOf(view, purpose);

    expect(outcome).toEqual(EXPECTED[purpose][state]);
  });

  it("waits the show budget to show or forget, and the act budget to act", async () => {
    const loaded = STATES.loaded ?? BASE;
    const budgets = [];

    for (const purpose of ["show", "forget", "act"] as const) {
      const project = projectAt(loaded);
      await readDeclarations(project, ROOT, purpose);
      budgets.push(project.fresh.mock.calls);
    }

    expect(budgets).toEqual([[[SHOW_BUDGET_MS]], [[SHOW_BUDGET_MS]], [[ACT_BUDGET_MS]]]);
  });

  it("names why the config does not load, and what to do", async () => {
    const view = STATES["fails, loaded before"] ?? BASE;

    const refusal = await readDeclarations(projectAt(view), ROOT, "act").catch((err: unknown) => err);

    expect(refusal).toBeInstanceOf(ProjectUnavailableError);
    expect(refusal).toMatchObject({
      message: expect.stringContaining("courier.config.ts: Unexpected token (3:1)"),
      cause: view.failure?.cause,
    });
    expect(refusal).toMatchObject({ message: expect.stringContaining("Fix courier.config and try again") });
  });

  it("names where the config belongs when there is none", async () => {
    const view = STATES["never had one"] ?? BASE;

    const refusal = await readDeclarations(projectAt(view), ROOT, "act").catch((err: unknown) => err);

    expect(refusal).toBeInstanceOf(ProjectUnavailableError);
    expect(refusal).toMatchObject({
      message: expect.stringContaining(`There is no courier.config in ${ROOT}`),
    });
    expect(refusal).toMatchObject({ message: expect.stringContaining("Create courier.config.ts first") });
  });
});
