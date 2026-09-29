/**
 * The mock wizard's requests to Studio, driven as the dialog drives them:
 * the plan is asked for again when the project changes under a plan on
 * screen — the events come through the real socket binding into a store,
 * as from Studio — an apply is sent once per click and never again on its
 * own, and a retryable manual outcome is checked again on request.
 */

import { io } from "socket.io-client";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import type { Socket } from "socket.io-client";
import type { ApisStore } from "../src/socket/apis-bindings";
import { bindApis } from "../src/socket/apis-bindings";
import { DEFAULT_SETTINGS } from "../src/store/constants";
import type { ScannedSource } from "../src/views/apis/types";
import type { DeclareClient } from "../src/views/mocks/wizard/declare-client";
import { reviewCta } from "../src/views/mocks/wizard/review-cta";
import { watchProject } from "../src/views/mocks/wizard/watch-project";
import type {
  DeclarePreview,
  ManualOutcome,
  ReadyOutcome,
} from "../src/views/mocks/wizard/wire-types";
import type { WizardSession } from "../src/views/mocks/wizard/wizard-session";
import { createWizardSession } from "../src/views/mocks/wizard/wizard-session";

const READY: ReadyOutcome = {
  status: "ready",
  target: "courier.mocks.ts",
  creates: true,
  baseHash: null,
  planDigest: "b".repeat(64),
  hunks: [
    { lines: [{ kind: "add", text: "export default defineMocks({", oldLine: null, newLine: 1 }] },
  ],
  warnings: [],
};
const BUSY: ManualOutcome = {
  status: "manual",
  target: null,
  creates: true,
  reasons: [
    {
      code: "STUDIO_BUSY",
      source: null,
      message: "Studio is still loading courier.config; try again in a moment.",
    },
  ],
  snippet: 'import { defineMocks } from "@noverax/courier-mock";\n',
  retryable: true,
};
const LOADED = {
  state: "loaded",
  revision: 2,
  configFile: "courier.config.ts",
  loadedAt: 1_000,
} as const;

type ProjectStoreState = ApisStore & { scanSources: ScannedSource[] };

function studioStore() {
  return create<ProjectStoreState>((set) => ({
    configStatus: LOADED,
    setConfigStatus: (configStatus) => set({ configStatus }),
    mocksFileStatus: null,
    setMocksFileStatus: (mocksFileStatus) => set({ mocksFileStatus }),
    setRegistrySources: vi.fn(),
    scanSources: [],
    setScanSources: (scanSources) => set({ scanSources }),
    settings: DEFAULT_SETTINGS,
  }));
}

function deliver(socket: Socket, event: string, payload: unknown): void {
  const listeners = socket.listeners(event);
  expect(listeners.length).toBeGreaterThan(0);
  for (const listener of listeners) listener(payload);
}

let socket: Socket;
let store: ReturnType<typeof studioStore>;
let preview: Mock<DeclareClient["preview"]>;
let apply: Mock<DeclareClient["apply"]>;
let session: WizardSession;
/* The session's clock: a test moves it on to click a plan after it has been on screen for a while. */
let clock: number;
const stops: Array<() => void> = [];

beforeEach(() => {
  socket = io("http://127.0.0.1:9", { autoConnect: false });
  store = studioStore();
  preview = vi.fn<DeclareClient["preview"]>();
  apply = vi.fn<DeclareClient["apply"]>();
  clock = 5_000;
  session = createWizardSession({
    client: { preview, apply },
    now: () => clock,
    log: { error: vi.fn() },
  });
  stops.push(
    bindApis(socket, store.getState),
    watchProject(store, () => session.projectChanged()),
  );
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  socket.close();
});

async function reviewWith(outcome: DeclarePreview): Promise<void> {
  preview.mockResolvedValueOnce(outcome);
  session.dispatch({ type: "toggleSource", source: "api", declaredKeys: [] });
  session.dispatch({ type: "goTo", step: "configure" });
  session.review();
  await vi.waitFor(() => expect(session.getState().plan.status).not.toBe("loading"));
}

describe("a plan on screen when the project changes", () => {
  it("is asked for again after each change that can change it, and never applied", async () => {
    await reviewWith(READY);
    preview.mockResolvedValue(READY);

    deliver(socket, "config:status", { ...LOADED, revision: 3, loadedAt: 2_000 });
    deliver(socket, "scan:sources", { sources: [], scannedFiles: 0 });
    deliver(socket, "mocks:status", { file: "/p/courier.mocks.ts", error: "ParseError" });

    await vi.waitFor(() => expect(session.getState().plan.status).toBe("ready"));
    expect(preview).toHaveBeenCalledTimes(4);
    expect(apply).not.toHaveBeenCalled();
  });

  it("is not asked for again for a store change that cannot change it", async () => {
    await reviewWith(READY);

    deliver(socket, "config:status", LOADED);
    deliver(socket, "mocks:status", null);

    expect(preview).toHaveBeenCalledTimes(1);
  });

  it("is left alone while an apply is in flight, and after one Studio took back", async () => {
    await reviewWith(READY);
    let answer: (value: {
      status: "rolledBack";
      target: string;
      creates: boolean;
      reason: string;
      snippet: string;
    }) => void = () => {};
    apply.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    clock += 60_000;
    session.apply();
    deliver(socket, "config:status", { ...LOADED, revision: 3, loadedAt: 2_000 });
    answer({
      status: "rolledBack",
      target: "courier.mocks.ts",
      creates: true,
      reason: "did not load",
      snippet: "x",
    });
    await vi.waitFor(() => expect(session.getState().apply.status).toBe("rolledBack"));
    deliver(socket, "config:status", { ...LOADED, revision: 4, loadedAt: 3_000 });

    expect(preview).toHaveBeenCalledTimes(1);
  });
});

describe("applying", () => {
  it("sends the previewed declarations with the preview's hashes, once however often it is clicked", async () => {
    await reviewWith(READY);
    apply.mockResolvedValue({
      status: "applied",
      target: "courier.mocks.ts",
      keys: ["api"],
      warnings: [],
    });

    clock += 60_000;
    session.apply();
    session.apply();
    await vi.waitFor(() => expect(session.getState().step).toBe("done"));

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]).toEqual([
      {
        mocks: [{ key: "api", source: "api", port: null, seedCount: 20, autoStart: true }],
        baseHash: null,
        planDigest: READY.planDigest,
      },
    ]);
  });

  it("sends nothing for a click that comes as the plan appears, such as the second click of a double click", async () => {
    await reviewWith(READY);
    apply.mockResolvedValue({
      status: "applied",
      target: "courier.mocks.ts",
      keys: ["api"],
      warnings: [],
    });

    session.apply();
    expect(session.getState().apply).toEqual({ status: "idle" });
    expect(apply).not.toHaveBeenCalled();

    clock += 60_000;
    session.apply();
    await vi.waitFor(() => expect(session.getState().step).toBe("done"));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("does not send an apply again when its answer never came", async () => {
    await reviewWith(READY);
    apply.mockRejectedValueOnce(new Error("Failed to fetch"));

    clock += 60_000;
    session.apply();
    await vi.waitFor(() => expect(session.getState().apply.status).toBe("failed"));
    session.apply();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(reviewCta(session.getState())).toEqual({ kind: "checkAgain", label: "Check again" });
  });
});

describe("a manual outcome", () => {
  it("offers to check again when Studio says asking again may succeed, and then shows the plan", async () => {
    await reviewWith(BUSY);
    expect(reviewCta(session.getState())).toEqual({ kind: "checkAgain", label: "Check again" });

    preview.mockResolvedValueOnce(READY);
    session.review();
    await vi.waitFor(() => expect(session.getState().plan.status).toBe("ready"));

    expect(preview).toHaveBeenCalledTimes(2);
    expect(reviewCta(session.getState())).toMatchObject({
      kind: "apply",
      label: "Create courier.mocks.ts",
    });
  });

  it("offers only to close when asking again cannot succeed without a change", async () => {
    await reviewWith({
      ...BUSY,
      retryable: false,
      reasons: [{ code: "MOCKS_JAVASCRIPT", source: null, message: "js" }],
    });

    expect(reviewCta(session.getState())).toEqual({ kind: "close", label: "Close" });
  });
});
