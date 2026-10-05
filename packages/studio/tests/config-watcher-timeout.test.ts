/**
 * A load that never finishes — a module that awaits a connection at top
 * level — is given up after the timeout, so the reloads and edits behind it
 * still run and fixing the module reloads the config. A load given up that
 * succeeds after all is run when nothing has changed since it read the
 * project, reloaded when something has, and never replaces a newer outcome;
 * one that fails after all reports what it threw. A JSON module a load given
 * up had read is read from disk again by the loads after it.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { LoadedCourierConfig } from "../src/server/config-loader";
import { ConfigLoaderError, loadCourierConfig } from "../src/server/config-loader";
import { type ConfigWatcher, startConfigWatcher } from "../src/server/config-watcher";
import type { WatcherStatus } from "../src/server/watcher-status";

/* Far longer than a load of these projects takes once the transformer is
   warm, and short enough to wait out in every test. */
const TIMEOUT_MS = 400;
/** Long enough for a native notification to arrive and a reload to run. */
const SETTLE_MS = 250;
const HANGS = "await new Promise(() => {})\n";

let watchers: ConfigWatcher[] = [];
let roots: string[] = [];
let keys = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

async function until(condition: () => boolean, budgetMs = 5000): Promise<void> {
  for (let waited = 0; waited < budgetMs && !condition(); waited += 25) await sleep(25);
}

interface Watched {
  watcher: ConfigWatcher;
  applied: LoadedCourierConfig[];
  failed: unknown[];
}

function start(projectRoot: string, watcherStatus?: WatcherStatus): Watched {
  const applied: LoadedCourierConfig[] = [];
  const failed: unknown[] = [];
  const watcher = startConfigWatcher({
    projectRoot,
    watcherStatus,
    loadTimeoutMs: TIMEOUT_MS,
    current: () => applied.at(-1) ?? null,
    onApplied: (loaded) => applied.push(loaded),
    onFailed: (error) => failed.push(error),
  });
  watchers.push(watcher);
  return { watcher, applied, failed };
}

function fakeStatus() {
  return {
    setApiPathCount: vi.fn<WatcherStatus["setApiPathCount"]>(),
    emitChange: vi.fn<WatcherStatus["emitChange"]>(),
    sendSnapshot: vi.fn<WatcherStatus["sendSnapshot"]>(),
  };
}

/** A project whose config imports one module, which imports another. */
function makeProject(): { root: string; config: string; deep: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "config-watcher-timeout-")));
  roots.push(root);
  mkdirSync(join(root, "src"));
  const deep = join(root, "src", "deep.ts");
  const config = join(root, "courier.config.ts");
  writeFileSync(deep, 'export const host = "v1.example.com"\n');
  writeFileSync(
    join(root, "src", "api.ts"),
    'import { host } from "./deep"\nexport const api = { baseURL: host }\n',
  );
  writeFileSync(
    config,
    'import { api } from "./src/api"\nexport default { sources: { demo: api } }\n',
  );
  return { root, config, deep };
}

/** A key on `globalThis` no other module or test uses. */
function uniqueKey(): string {
  return `__courierWatcherTimeout${process.pid}_${++keys}`;
}

function count(key: string): number {
  const value: unknown = Reflect.get(globalThis, key);
  return typeof value === "number" ? value : 0;
}

/**
 * A module that counts its evaluations under `key`, awaits what `globalThis`
 * holds under `key`_gate — at once when nothing — and then exports `host`.
 */
function gatedModule(key: string, host: string): string {
  return (
    `Reflect.set(globalThis, "${key}", (Reflect.get(globalThis, "${key}") ?? 0) + 1)\n` +
    `await Reflect.get(globalThis, "${key}_gate")\n` +
    `export const host = "${host}"\n`
  );
}

/** Hold every evaluation of `gatedModule(key, …)` until `open` is called. */
function closeGate(key: string): { open(): void } {
  const { promise, resolve } = Promise.withResolvers<void>();
  Reflect.set(globalThis, `${key}_gate`, promise);
  return { open: () => resolve() };
}

/** A module that counts its evaluations under `key` and takes `ms` to export `host`. */
function slowModule(key: string, host: string, ms: number): string {
  return (
    `Reflect.set(globalThis, "${key}", (Reflect.get(globalThis, "${key}") ?? 0) + 1)\n` +
    `await new Promise((r) => setTimeout(r, ${ms}))\n` +
    `export const host = "${host}"\n`
  );
}

function baseURLOf(loaded: LoadedCourierConfig | null | undefined): unknown {
  return (loaded?.config.sources as Record<string, { baseURL?: unknown }> | undefined)?.demo
    ?.baseURL;
}

/* The first load in a process sets up the transformer, which alone can take
   longer than the timeout the tests use. */
beforeAll(async () => {
  const { root } = makeProject();
  await loadCourierConfig(root);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const watcher of watchers) watcher.stop();
  watchers = [];
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe("startConfigWatcher — a load that never finishes", () => {
  it("gives up a reload that never finishes, reports CONFIG_LOAD_TIMEOUT, and loads the next save", async () => {
    const { root, deep } = makeProject();
    const { watcher, applied, failed } = start(root);
    await watcher.settled();
    expect(applied.map(baseURLOf)).toEqual(["v1.example.com"]);
    await sleep(SETTLE_MS);

    writeFileSync(deep, `${HANGS}export const host = "hung.example.com"\n`);
    await until(() => failed.length > 0);
    expect(failed).toMatchObject([{ code: "CONFIG_LOAD_TIMEOUT" }]);
    await sleep(SETTLE_MS);
    writeFileSync(deep, 'export const host = "v3.example.com"\n');
    await until(() => applied.length > 1);

    expect(applied.map(baseURLOf)).toEqual(["v1.example.com", "v3.example.com"]);
  });

  it("an edit queued behind a hung reload runs once the reload is given up", async () => {
    const { root, deep } = makeProject();
    const { watcher, failed } = start(root);
    await watcher.settled();
    await sleep(SETTLE_MS);
    const key = uniqueKey();
    closeGate(key);
    writeFileSync(deep, gatedModule(key, "hung.example.com"));
    await until(() => count(key) === 1);
    expect(count(key)).toBe(1);

    const edit = watcher.runExclusive(async (ctx) => baseURLOf(ctx.current()), 5000);
    const outcome = await Promise.race([edit, sleep(3000).then(() => "still waiting")]);

    expect(outcome).toBe("v1.example.com");
    expect(failed).toMatchObject([{ code: "CONFIG_LOAD_TIMEOUT" }]);
  });

  it("a first load that hangs in an imported module reloads once that module is fixed", async () => {
    const { root, deep } = makeProject();
    const hung = `${HANGS}export const host = "hung.example.com"\n`;
    writeFileSync(deep, hung);
    const { applied, failed } = start(root);
    await until(() => failed.length > 0);
    expect(failed).toMatchObject([{ code: "CONFIG_LOAD_TIMEOUT" }]);
    const [timeout] = failed;
    expect(timeout instanceof ConfigLoaderError && timeout.depHashes?.get(deep)).toBe(sha256(hung));
    await sleep(SETTLE_MS);

    writeFileSync(deep, 'export const host = "fixed.example.com"\n');
    await until(() => applied.length > 0);

    expect(applied.map(baseURLOf)).toEqual(["fixed.example.com"]);
  });
});

describe("startConfigWatcher — a load given up that finishes after all", () => {
  it("a load that outlives the timeout is applied when it finishes and nothing changed", async () => {
    const { root, deep } = makeProject();
    const key = uniqueKey();
    const gate = closeGate(key);
    writeFileSync(deep, gatedModule(key, "late.example.com"));
    const { watcher, applied, failed } = start(root);
    await until(() => failed.length > 0);
    expect(failed).toMatchObject([{ code: "CONFIG_LOAD_TIMEOUT" }]);
    expect(applied).toEqual([]);

    gate.open();
    await until(() => applied.length > 0);
    await sleep(SETTLE_MS);
    await watcher.settled();

    expect(applied.map(baseURLOf)).toEqual(["late.example.com"]);
    expect(count(key)).toBe(1);
    expect(failed).toHaveLength(1);
  });

  it("a load given up that finishes after a newer outcome never replaces it", async () => {
    const { root, deep } = makeProject();
    const { watcher, applied, failed } = start(root);
    await watcher.settled();
    await sleep(SETTLE_MS);
    const key = uniqueKey();
    const gate = closeGate(key);

    writeFileSync(deep, gatedModule(key, "late.example.com"));
    await until(() => failed.length > 0);
    expect(failed).toMatchObject([{ code: "CONFIG_LOAD_TIMEOUT" }]);
    await sleep(SETTLE_MS);
    writeFileSync(deep, 'export const host = "newer.example.com"\n');
    await until(() => applied.length > 1);
    gate.open();
    await sleep(SETTLE_MS);
    await watcher.settled();

    expect(applied.map(baseURLOf)).toEqual(["v1.example.com", "newer.example.com"]);
    expect(count(key)).toBe(1);
  });

  it("a load given up that finishes after its inputs changed requests one reload instead", async () => {
    const { root, config, deep } = makeProject();
    const key = uniqueKey();
    const gate = closeGate(key);
    writeFileSync(deep, gatedModule(key, "late.example.com"));
    const status = fakeStatus();
    const { watcher, applied, failed } = start(root, status);
    await until(() => failed.length > 0);
    expect(failed).toMatchObject([{ code: "CONFIG_LOAD_TIMEOUT" }]);
    await sleep(SETTLE_MS);

    /* Saved in the same turn the load finishes, so no notification of the
       save has reached the engine when it decides. */
    writeFileSync(deep, 'export const host = "saved.example.com"\n');
    gate.open();
    await until(() => applied.length > 0);
    await sleep(SETTLE_MS * 2);
    await watcher.settled();

    expect(applied.map(baseURLOf)).not.toContain("late.example.com");
    expect(baseURLOf(applied.at(-1))).toBe("saved.example.com");
    const reloadsOfConfig = status.emitChange.mock.calls.filter(
      ([, paths]) => paths.join() === relative(root, config),
    );
    expect(reloadsOfConfig).toHaveLength(1);
  });

  it("a load given up that fails after all reports what it threw in place of the timeout", async () => {
    const { root, deep } = makeProject();
    const key = uniqueKey();
    const { promise, reject } = Promise.withResolvers<void>();
    promise.catch(() => {});
    Reflect.set(globalThis, `${key}_gate`, promise);
    writeFileSync(deep, gatedModule(key, "late.example.com"));
    const { watcher, applied, failed } = start(root);
    await until(() => failed.length > 0);
    expect(failed).toMatchObject([{ code: "CONFIG_LOAD_TIMEOUT" }]);

    reject(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
    await until(() => failed.length > 1);
    await watcher.settled();

    expect(failed).toHaveLength(2);
    expect(failed[1] instanceof ConfigLoaderError && failed[1].message).toContain("ECONNREFUSED");
    expect(applied).toEqual([]);
    expect(count(key)).toBe(1);
  });

  it("a config slower than the timeout on every load, saved while its first load runs, ends loaded and stops loading", async () => {
    const { root, deep } = makeProject();
    const key = uniqueKey();
    const slowMs = TIMEOUT_MS + 200;
    writeFileSync(deep, slowModule(key, "v1.example.com", slowMs));
    const { applied, failed } = start(root);
    await until(() => count(key) === 1);

    writeFileSync(deep, slowModule(key, "v2.example.com", slowMs));
    await until(() => applied.length > 0, 8000);
    const loads = count(key);
    await sleep(3 * slowMs);

    expect(applied.map(baseURLOf)).toEqual(["v2.example.com"]);
    expect(count(key)).toBe(loads);
    expect(failed.length).toBeGreaterThan(0);
    expect(
      failed.every(
        (error) => error instanceof ConfigLoaderError && error.code === "CONFIG_LOAD_TIMEOUT",
      ),
    ).toBe(true);
  });
});

describe("startConfigWatcher — JSON a load given up had read", () => {
  it("an edit to a JSON module that a load given up had read is seen by the next reload", async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "config-watcher-timeout-json-")));
    roots.push(root);
    mkdirSync(join(root, "src"));
    const data = join(root, "src", "data.json");
    const db = join(root, "src", "db.ts");
    writeFileSync(data, '{ "host": "json-v1.example.com" }\n');
    writeFileSync(db, `${HANGS}export const db = 1\n`);
    writeFileSync(
      join(root, "courier.config.ts"),
      'import data from "./src/data.json"\nimport { db } from "./src/db"\nexport default { sources: { demo: { baseURL: data.host, db } } }\n',
    );
    const { watcher, applied, failed } = start(root);
    await until(() => failed.length > 0);
    expect(failed).toMatchObject([{ code: "CONFIG_LOAD_TIMEOUT" }]);
    await sleep(SETTLE_MS);

    writeFileSync(db, "export const db = 2\n");
    await until(() => applied.length > 0);
    await sleep(SETTLE_MS);
    writeFileSync(data, '{ "host": "json-v2.example.com" }\n');
    await until(() => applied.length > 1);
    await watcher.settled();

    expect(applied.map(baseURLOf)).toEqual(["json-v1.example.com", "json-v2.example.com"]);
  });
});
