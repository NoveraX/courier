/**
 * The owner of the project gives up a first load that never finishes: Studio
 * is then failed with `CONFIG_LOAD_TIMEOUT`, and every UI is told so, rather
 * than being left starting for good. Finishing edits, as Studio does when it
 * stops, refuses an edit still queued rather than waiting for it. A fresh
 * read answers after the saves already on disk, within its budget, and
 * refuses at once inside an edit rather than wait for itself.
 */
import { mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "socket.io";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as LastModifiedAtModule from "../../src/server/last-modified-at";
import type { FreshSnapshot, ProjectSnapshot, ProjectState } from "../../src/server/project-state/types";

/* Set to make every look at when a file changed fail, as a disk that went away would. */
const faults = vi.hoisted(() => ({ lastModifiedAt: false }));

vi.mock("../../src/server/last-modified-at", async (importOriginal) => {
  const actual = await importOriginal<typeof LastModifiedAtModule>();
  return {
    lastModifiedAt: (path: string) => {
      if (faults.lastModifiedAt) throw new Error(`EIO: i/o error, stat '${path}'`);
      return actual.lastModifiedAt(path);
    },
  };
});

import { BindingTable } from "../../src/server/catalog/binding-table";
import { createMockRegistry } from "../../src/server/mock-registry";
import { createProjectState } from "../../src/server/project-state/create-project-state";
import { clearStartupIssues } from "../../src/server/startup-issues";
import { createWatcherStatus } from "../../src/server/watcher-status";

let root: string;
/* Never attached to an HTTP server, so it holds nothing to close. */
let io: Server;
let project: ProjectState | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HANGS = "await new Promise(() => {})\nexport default { sources: {} }\n";

async function until(condition: () => boolean, budgetMs = 5000): Promise<void> {
  for (let waited = 0; waited < budgetMs && !condition(); waited += 25) await sleep(25);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* The config names the version its module exports in its source's baseURL. */
const VERSIONED = 'import { version } from "./version";\nexport default { sources: { demo: { baseURL: `https://v${version}.example` } } };\n';

function versionModule(version: number, delayMs = 0): string {
  const delay = delayMs > 0 ? `await new Promise((resolve) => setTimeout(resolve, ${delayMs}));\n` : "";
  return `${delay}export const version = ${version};\n`;
}

function versionOf(snapshot: ProjectSnapshot): number | null {
  const demo: unknown = snapshot.running?.config.sources.demo;
  const baseURL = isRecord(demo) ? demo.baseURL : undefined;
  const match = typeof baseURL === "string" ? /^https:\/\/v(\d+)\.example$/.exec(baseURL) : null;
  return match ? Number(match[1]) : null;
}

/* A project whose config loads the version in version.ts, loaded once. */
async function versionedProject(): Promise<{ state: ProjectState; versionFile: string }> {
  const versionFile = join(root, "version.ts");
  writeFileSync(versionFile, versionModule(1));
  writeFileSync(join(root, "courier.config.ts"), VERSIONED);
  const uiNamespace = io.of("/ui");
  const created = createProjectState({
    projectRoot: root,
    bindingTable: new BindingTable(),
    uiNamespace,
    watcherStatus: createWatcherStatus(uiNamespace),
    mocks: { mockRegistry: createMockRegistry(), mockManager: { setMocksFile: vi.fn() } },
  });
  project = created;
  await created.fresh(10_000);
  /* Late notifications of the fixture's own writes arrive meanwhile. */
  await sleep(300);
  return { state: created, versionFile };
}

beforeEach(() => {
  faults.lastModifiedAt = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "create-project-state-")));
  io = new Server();
});

afterEach(() => {
  project?.stop();
  project = null;
  clearStartupIssues();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("createProjectState", () => {
  it("a first load that never finishes leaves Studio failed with the timeout, not starting forever", async () => {
    writeFileSync(join(root, "courier.config.ts"), HANGS);
    const uiNamespace = io.of("/ui");
    const emit = vi.spyOn(uiNamespace, "emit");
    const statuses = () =>
      emit.mock.calls.filter(([event]) => event === "config:status").map(([, payload]) => payload);

    project = createProjectState({
      projectRoot: root,
      bindingTable: new BindingTable(),
      uiNamespace,
      watcherStatus: createWatcherStatus(uiNamespace),
      mocks: { mockRegistry: createMockRegistry(), mockManager: { setMocksFile: vi.fn() } },
      loadTimeoutMs: 300,
    });
    await until(() => statuses().length > 0);

    expect(project.snapshot()).toMatchObject({ starting: false, failure: { code: "CONFIG_LOAD_TIMEOUT" } });
    expect(statuses()).toHaveLength(1);
    const [status] = statuses();
    expect(status).toMatchObject({ state: "failed", configFile: null, error: { code: "CONFIG_LOAD_TIMEOUT" } });
    expect(isRecord(status) && isRecord(status.error) && status.error.message).toContain(
      "COURIER_CONFIG_LOAD_TIMEOUT_MS",
    );
  });

  it("finishing edits refuses one queued behind a load that hangs at once, and it never runs", async () => {
    writeFileSync(join(root, "courier.config.ts"), HANGS);
    const uiNamespace = io.of("/ui");
    project = createProjectState({
      projectRoot: root,
      bindingTable: new BindingTable(),
      uiNamespace,
      watcherStatus: createWatcherStatus(uiNamespace),
      mocks: { mockRegistry: createMockRegistry(), mockManager: { setMocksFile: vi.fn() } },
      loadTimeoutMs: 1000,
    });
    const transaction = vi.fn(async () => "edited");
    const edit = project.runExclusive(transaction, 1000);
    edit.catch(() => undefined);

    const started = Date.now();
    await project.finishEdits(6000);
    const tookMs = Date.now() - started;

    expect(tookMs).toBeLessThan(500);
    await expect(edit).rejects.toMatchObject({ code: "CONFIG_WATCHER_STOPPED" });
    await project.fresh(6000);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("fresh()", () => {
  it("fresh() right after a save returns the saved config; snapshot() alone still returns the old one", async () => {
    const { state, versionFile } = await versionedProject();
    expect(versionOf(state.snapshot())).toBe(1);

    writeFileSync(versionFile, versionModule(2));
    const control = state.snapshot();
    const view = await state.fresh(3_000);

    expect(versionOf(control)).toBe(1);
    expect(view.settling).toBe(false);
    expect(versionOf(view)).toBe(2);
  }, 20_000);

  it("fresh() with nothing changed loads nothing and returns within 50 ms", async () => {
    const { state } = await versionedProject();
    const { revision } = state.snapshot();

    const asked = performance.now();
    const view = await state.fresh(3_000);
    const tookMs = performance.now() - asked;

    expect(tookMs).toBeLessThan(50);
    expect(view).toMatchObject({ revision, settling: false });
    expect(versionOf(view)).toBe(1);
  }, 20_000);

  it("fresh() inside an edit throws at once instead of waiting for itself", async () => {
    const { state } = await versionedProject();

    const asked = Date.now();
    const edit = state.runExclusive(async () => {
      await sleep(10);
      return state.fresh(3_000);
    }, 1_000);

    await expect(edit).rejects.toMatchObject({ name: "ProjectStateError", code: "FRESH_INSIDE_EDIT" });
    expect(Date.now() - asked).toBeLessThan(1_000);
    await expect(state.fresh(3_000)).resolves.toMatchObject({ settling: false });
  }, 20_000);

  it("fresh() under continuous saves returns once the saves on disk at the call are loaded, not after the saves stop", async () => {
    const { state, versionFile } = await versionedProject();
    /* Each load takes longer than the saves are apart, so the chain is never idle while they go on. */
    let version = 1;
    const saving = setInterval(() => {
      version += 1;
      writeFileSync(versionFile, versionModule(version, 250));
    }, 150);
    try {
      await sleep(600);
      const onDisk = version;
      const asked = Date.now();
      const view = await state.fresh(8_000);
      const tookMs = Date.now() - asked;

      expect(view.settling).toBe(false);
      expect(versionOf(view)).toBeGreaterThanOrEqual(onDisk);
      expect(tookMs).toBeLessThan(4_000);
    } finally {
      clearInterval(saving);
    }
  }, 30_000);

  it("fresh() while files are saved one after another waits for the last, and no UI is told of a load that fails", async () => {
    const { state } = await versionedProject();
    const generated = join(root, "generated.ts");
    const last = join(root, "last.ts");
    writeFileSync(generated, "export const generation = 0;\n");
    writeFileSync(last, "export const next = undefined;\n");
    writeFileSync(
      join(root, "courier.config.ts"),
      'import { generation } from "./generated";\nimport { next } from "./last";\nimport { version } from "./version";\n' +
        "export default { sources: { demo: { baseURL: `https://v${version + generation + (next ?? 0)}.example` } } };\n",
    );
    expect(await state.fresh(5_000)).toMatchObject({ settling: false, failure: null });
    await sleep(300);
    const emit = vi.spyOn(io.of("/ui"), "emit");

    /* A generator's run: the config first, needing an export only the last file written adds. */
    writeFileSync(
      join(root, "courier.config.ts"),
      'import { generation } from "./generated";\nimport { next } from "./last";\nimport { version } from "./version";\n' +
        'if (next === undefined) throw new Error("last.ts is not written yet");\n' +
        "export default { sources: { demo: { baseURL: `https://v${version + generation + next}.example` } } };\n",
    );
    const view = state.fresh(5_000);
    for (let generation = 1; generation <= 12; generation += 1) {
      await sleep(25);
      writeFileSync(generated, `export const generation = ${generation};\n`);
    }
    await sleep(25);
    writeFileSync(last, "export const next = 1;\n");

    expect(await view).toMatchObject({ settling: false, failure: null });
    expect(versionOf(await view)).toBe(14);
    const statuses = emit.mock.calls.filter(([event]) => event === "config:status").map(([, payload]) => payload);
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.filter((status) => isRecord(status) && status.state !== "loaded")).toEqual([]);
  }, 20_000);

  it("fresh() from a timer an edit set, fired after the edit returned, catches up instead of refusing", async () => {
    const { state } = await versionedProject();
    const fired = Promise.withResolvers<FreshSnapshot>();

    await state.runExclusive(async () => {
      setTimeout(() => fired.resolve(state.fresh(3_000)), 200);
    }, 1_000);

    await expect(fired.promise).resolves.toMatchObject({ settling: false });
  }, 20_000);

  it("fresh() answers settling when Studio cannot compare the files it watches with the disk", async () => {
    const { state, versionFile } = await versionedProject();

    faults.lastModifiedAt = true;
    writeFileSync(versionFile, versionModule(2));
    const view = await state.fresh(3_000);

    expect(view.settling).toBe(true);
    expect(versionOf(view)).toBe(1);
  }, 20_000);

  it("fresh() right after a save returns the saved config while a symlink loop sits at a watched name", async () => {
    const { state, versionFile } = await versionedProject();
    const loop = join(root, "courier.config.mjs");
    symlinkSync("courier.config.mjs", loop);
    await sleep(700);

    writeFileSync(versionFile, versionModule(2));
    const view = await state.fresh(3_000);
    unlinkSync(loop);

    expect(view.settling).toBe(false);
    expect(versionOf(view)).toBe(2);
  }, 20_000);

  it("fresh() past its budget returns the current state with settling true", async () => {
    const { state, versionFile } = await versionedProject();

    writeFileSync(versionFile, versionModule(2, 1_500));
    const asked = Date.now();
    const view = await state.fresh(300);
    const tookMs = Date.now() - asked;

    expect(view.settling).toBe(true);
    expect(versionOf(view)).toBe(1);
    expect(tookMs).toBeLessThan(1_000);
    await expect(state.fresh(5_000)).resolves.toMatchObject({ settling: false });
    expect(versionOf(state.snapshot())).toBe(2);
  }, 20_000);
});
