import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoadedCourierConfig } from "../src/server/config-loader";
import { type ConfigWatcher, startConfigWatcher } from "../src/server/config-watcher";
import { studioTransformCache } from "../src/server/studio-transform-cache";
import type { WatcherStatus } from "../src/server/watcher-status";

let watchers: ConfigWatcher[] = [];
let roots: string[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Long enough for a native notification to arrive and a reload to run. */
const SETTLE_MS = 250;

/** The engine on a project, with every outcome it reports, in order. */
interface Watched {
  watcher: ConfigWatcher;
  /** Every load that succeeded, the first one included. */
  applied: LoadedCourierConfig[];
  /** Every load that failed, with what it threw. */
  failed: unknown[];
  /** What the owner runs: the last load that succeeded. */
  current(): LoadedCourierConfig | null;
}

function start(projectRoot: string, watcherStatus?: WatcherStatus): Watched {
  let current: LoadedCourierConfig | null = null;
  const applied: LoadedCourierConfig[] = [];
  const failed: unknown[] = [];
  const watcher = startConfigWatcher({
    projectRoot,
    watcherStatus,
    current: () => current,
    onApplied: (loaded) => {
      current = loaded;
      applied.push(loaded);
    },
    onFailed: (error) => failed.push(error),
  });
  watchers.push(watcher);
  return { watcher, applied, failed, current: () => current };
}

function fakeStatus() {
  return {
    setApiPathCount: vi.fn<WatcherStatus["setApiPathCount"]>(),
    emitChange: vi.fn<WatcherStatus["emitChange"]>(),
    setMockFileCount: vi.fn<WatcherStatus["setMockFileCount"]>(),
    sendSnapshot: vi.fn<WatcherStatus["sendSnapshot"]>(),
  };
}

/** A project whose config imports one module, which imports another. */
function makeProject(): { root: string; config: string; direct: string; deep: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "config-watcher-")));
  roots.push(root);
  mkdirSync(join(root, "src"));
  const deep = join(root, "src", "deep.ts");
  const direct = join(root, "src", "api.ts");
  const config = join(root, "courier.config.ts");
  writeFileSync(deep, 'export const host = "v1.example.com"\n');
  writeFileSync(direct, 'import { host } from "./deep"\nexport const api = { baseURL: host }\n');
  writeFileSync(
    config,
    'import { api } from "./src/api"\nexport default { sources: { demo: api } }\n',
  );
  return { root, config, direct, deep };
}

let slowModules = 0;

/**
 * Make `file` a module that marks on `globalThis` that it started, waits
 * 300 ms, then runs `tail`. Returns the marker's key.
 */
function slowModule(file: string, tail: string): string {
  const marker = `__courierWatcherSlow${process.pid}_${++slowModules}`;
  writeFileSync(
    file,
    `Reflect.set(globalThis, "${marker}", true)\nawait new Promise((r) => setTimeout(r, 300))\n${tail}\n`,
  );
  return marker;
}

function baseURLOf(loaded: LoadedCourierConfig | null | undefined): unknown {
  return (loaded?.config.sources as Record<string, { baseURL?: unknown }> | undefined)?.demo
    ?.baseURL;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

async function until(condition: () => boolean, budgetMs = 5000): Promise<void> {
  for (let waited = 0; waited < budgetMs && !condition(); waited += 25) await sleep(25);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const watcher of watchers) watcher.stop();
  watchers = [];
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe("startConfigWatcher", () => {
  it("makes the first load on its own and reports it once", async () => {
    const { root } = makeProject();
    const { watcher, applied, failed } = start(root);

    await watcher.settled();

    expect(applied.map(baseURLOf)).toEqual(["v1.example.com"]);
    expect(failed).toEqual([]);
  });

  it("stop() is idempotent", () => {
    const { root } = makeProject();
    const { watcher } = start(root);

    expect(() => {
      watcher.stop();
      watcher.stop();
    }).not.toThrow();
  });

  it("does not report the first load synchronously", () => {
    const { root } = makeProject();
    const { applied, failed } = start(root);

    expect(applied).toEqual([]);
    expect(failed).toEqual([]);
  });

  it("loads nothing when stopped before the first load starts", async () => {
    const { root, deep } = makeProject();
    const marker = slowModule(deep, 'export const host = "v1.example.com"');
    const { watcher, applied, failed } = start(root);

    watcher.stop();
    await watcher.settled();

    expect(Reflect.get(globalThis, marker)).toBeUndefined();
    expect(applied).toEqual([]);
    expect(failed).toEqual([]);
  });

  it("drops a first load that succeeds after a stop, and arms no watch", async () => {
    const { root, deep } = makeProject();
    const marker = slowModule(deep, 'export const host = "late.example.com"');
    const status = fakeStatus();
    const { watcher, applied, failed } = start(root, status);
    await until(() => Reflect.get(globalThis, marker) === true);
    expect(Reflect.get(globalThis, marker)).toBe(true);

    watcher.stop();
    await watcher.settled();

    expect(applied).toEqual([]);
    expect(failed).toEqual([]);
    expect(status.setApiPathCount).not.toHaveBeenCalled();
  });

  it("drops a first load that fails after a stop, and arms no watch", async () => {
    const { root, deep } = makeProject();
    const marker = slowModule(deep, 'throw new Error("the deep module failed")');
    const status = fakeStatus();
    const { watcher, applied, failed } = start(root, status);
    await until(() => Reflect.get(globalThis, marker) === true);
    expect(Reflect.get(globalThis, marker)).toBe(true);

    watcher.stop();
    await watcher.settled();

    expect(applied).toEqual([]);
    expect(failed).toEqual([]);
    expect(status.setApiPathCount).not.toHaveBeenCalled();
  });

  it("runs an edit only after the first load, with that load as what Studio runs", async () => {
    const { root } = makeProject();
    const { watcher } = start(root);

    const seen = await watcher.runExclusive(async (ctx) => baseURLOf(ctx.current()), 5000);

    expect(seen).toBe("v1.example.com");
  });
});

/**
 * The behaviour the watcher exists for. Each case drives the real filesystem
 * and the real loader — a change that does not reach `onReload` here is a
 * change a developer would not see in the Studio.
 */
describe("startConfigWatcher — reload", () => {
  /** The engine on a fresh project, past its first load; `reloads` holds each load after it. */
  async function watchProject(watcherStatus?: WatcherStatus) {
    const project = makeProject();
    const watched = start(project.root, watcherStatus);
    await watched.watcher.settled();
    const [initial] = watched.applied;
    const reloads = watched.applied;
    reloads.length = 0;
    await sleep(SETTLE_MS);
    return { ...project, ...watched, initial, reloads };
  }

  async function nextReload(reloads: LoadedCourierConfig[], budgetMs = 4000) {
    const before = reloads.length;
    for (let waited = 0; waited < budgetMs; waited += 50) {
      if (reloads.length > before) return reloads[reloads.length - 1];
      await sleep(50);
    }
    return null;
  }

  it("picks up an edit to a module the config imports transitively", async () => {
    const { deep, reloads } = await watchProject();

    writeFileSync(deep, 'export const host = "v2.example.com"\n');

    expect(baseURLOf(await nextReload(reloads))).toBe("v2.example.com");
  });

  it("sees an edited module although the transforms of the others are cached", async () => {
    const { root, deep, reloads } = await watchProject();
    const computed: string[] = [];
    const cache = studioTransformCache(root);
    const transform = cache.transform.bind(cache);
    vi.spyOn(cache, "transform").mockImplementation((options, compute) =>
      transform(options, (miss) => {
        computed.push(miss.filename ?? "");
        return compute(miss);
      }),
    );

    writeFileSync(deep, 'export const host = "v2.example.com"\n');

    expect(baseURLOf(await nextReload(reloads))).toBe("v2.example.com");
    expect(computed).toEqual([deep]);
  });

  it("keeps working after an editor replaces a file rather than writing it", async () => {
    const { root, deep, reloads } = await watchProject();

    const temp = join(root, "src", "deep.tmp");
    writeFileSync(temp, 'export const host = "atomic.example.com"\n');
    renameSync(temp, deep);
    expect(baseURLOf(await nextReload(reloads))).toBe("atomic.example.com");

    writeFileSync(deep, 'export const host = "after-atomic.example.com"\n');

    expect(baseURLOf(await nextReload(reloads))).toBe("after-atomic.example.com");
  });

  it("watches a module the config has only just started importing", async () => {
    const { root, config, reloads } = await watchProject();

    const added = join(root, "src", "added.ts");
    writeFileSync(added, 'export const host = "added.example.com"\n');
    writeFileSync(
      config,
      'import { host } from "./src/added"\nexport default { sources: { demo: { baseURL: host } } }\n',
    );
    const afterImport = await nextReload(reloads);
    expect(baseURLOf(afterImport)).toBe("added.example.com");
    expect(afterImport?.deps).toContain(added);

    writeFileSync(added, 'export const host = "added-edited.example.com"\n');

    expect(baseURLOf(await nextReload(reloads))).toBe("added-edited.example.com");
  });

  it("reports the tracked count and each change to the watcher status", async () => {
    const status = fakeStatus();
    const { deep, initial } = await watchProject(status);
    expect(initial).toBeDefined();
    /* The files the load read; the names only watched for their creation are not counted. */
    expect(status.setApiPathCount).toHaveBeenCalledWith(initial?.deps.filter(existsSync).length);

    writeFileSync(deep, 'export const host = "counted.example.com"\n');
    /* Waiting for the first call alone would be hostage to a late notification
       about the fixture's own creation arriving ahead of the edit. */
    const reported = () =>
      status.emitChange.mock.calls.some(([kind, paths]) => kind === "api" && paths.includes(deep));
    for (let waited = 0; waited < 4000 && !reported(); waited += 50) {
      await sleep(50);
    }

    expect(reported()).toBe(true);
  });

  /** The demo shape: the config lives in one package, its modules in a sibling. */
  it("reloads when a module reached through a tsconfig alias changes", async () => {
    const workspace = realpathSync(mkdtempSync(join(tmpdir(), "config-watcher-alias-")));
    roots.push(workspace);
    const project = join(workspace, "app");
    mkdirSync(join(workspace, "shared"), { recursive: true });
    mkdirSync(project, { recursive: true });
    const shared = join(workspace, "shared", "api.ts");
    writeFileSync(shared, 'export const api = { baseURL: "v1.example.com" }\n');
    writeFileSync(
      join(project, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { paths: { "@shared/*": ["../shared/*"] } } }),
    );
    writeFileSync(
      join(project, "courier.config.ts"),
      'import { api } from "@shared/api"\nexport default { sources: { demo: api } }\n',
    );

    const { watcher, applied } = start(project);
    await watcher.settled();
    expect(applied[0]?.deps).toContain(shared);
    await sleep(SETTLE_MS);

    writeFileSync(shared, 'export const api = { baseURL: "v2.example.com" }\n');

    expect(baseURLOf(await nextReload(applied))).toBe("v2.example.com");
  });

  it("keeps the last good config when a dep is deleted, and recovers when it returns", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deep, initial, reloads, current } = await watchProject();

    unlinkSync(deep);
    await sleep(1200);
    /* What matters is that the Studio still holds a working config, not that
       it holds the same object: the loader may serve the vanished module from
       its own cache and hand back an equal config under a new identity. */
    expect(baseURLOf(current())).toBe(baseURLOf(initial));

    writeFileSync(deep, 'export const host = "restored.example.com"\n');

    expect(baseURLOf(await nextReload(reloads))).toBe("restored.example.com");
  });
});

const CANDIDATE = 'export default { sources: { demo: { baseURL: "candidate.example.com" } } }\n';

describe("startConfigWatcher — one reload at a time, and edits", () => {
  /** The engine past its first load; `reloads` and `failures` hold each outcome after it. */
  async function watched() {
    const project = makeProject();
    const status = fakeStatus();
    const engine = start(project.root, status);
    await engine.watcher.settled();
    const [initial] = engine.applied;
    const reloads = engine.applied;
    reloads.length = 0;
    await sleep(SETTLE_MS);
    status.emitChange.mockClear();
    return { ...project, ...engine, initial, reloads, emitChange: status.emitChange };
  }

  it("never lets a slow reload replace the one after it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deep, watcher, reloads, emitChange, current } = await watched();

    writeFileSync(
      deep,
      'await new Promise((r) => setTimeout(r, 900))\nexport const host = "slow.example.com"\n',
    );
    await until(() => emitChange.mock.calls.length > 0);
    await sleep(100);
    writeFileSync(deep, 'export const host = "fast.example.com"\n');
    await until(() => reloads.some((loaded) => baseURLOf(loaded) === "fast.example.com"));
    await sleep(1200);
    await watcher.settled();

    expect(baseURLOf(reloads.at(-1))).toBe("fast.example.com");
    expect(baseURLOf(current())).toBe("fast.example.com");
  });

  it("leaves Studio as it was when an edit loads a candidate and does not apply it", async () => {
    const { config, watcher, reloads, failed, initial, current } = await watched();
    const original = readFileSync(config, "utf8");

    const loadedHost = await watcher.runExclusive(async (ctx) => {
      writeFileSync(config, CANDIDATE);
      ctx.acknowledge([config]);
      const candidate = await ctx.load();
      writeFileSync(config, original);
      ctx.acknowledge([config]);
      return baseURLOf(candidate);
    }, 5000);
    await sleep(1500);
    await watcher.settled();

    expect(loadedHost).toBe("candidate.example.com");
    expect(reloads).toEqual([]);
    expect(failed).toEqual([]);
    expect(current()).toBe(initial);
  });

  it("applies what an edit accepts as a reload would, and does not reload again for its write", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { config, watcher, reloads, current } = await watched();

    await watcher.runExclusive(async (ctx) => {
      writeFileSync(config, CANDIDATE);
      ctx.acknowledge([config]);
      ctx.apply(await ctx.load());
    }, 5000);
    await sleep(1500);
    await watcher.settled();

    expect(reloads.map(baseURLOf)).toEqual(["candidate.example.com"]);
    expect(baseURLOf(current())).toBe("candidate.example.com");
  });

  it("abandons a load that takes too long, so the edit can undo its write before any reload", async () => {
    const { deep, watcher, reloads, initial, current } = await watched();
    const original = readFileSync(deep, "utf8");

    const failure = await watcher.runExclusive(async (ctx) => {
      writeFileSync(
        deep,
        'await new Promise((r) => setTimeout(r, 1500))\nexport const host = "late.example.com"\n',
      );
      ctx.acknowledge([deep]);
      const error = await ctx.load().catch((err: unknown) => err);
      writeFileSync(deep, original);
      ctx.acknowledge([deep]);
      return error;
    }, 300);
    await sleep(2200);
    await watcher.settled();

    expect(failure).toMatchObject({ code: "CONFIG_LOAD_TIMEOUT" });
    expect(reloads).toEqual([]);
    expect(current()).toBe(initial);
  });

  it("reloads a write the edit acknowledged and then asks to have reloaded, once the edit is done", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { config, watcher, reloads } = await watched();
    let reloadsDuringEdit = -1;

    await watcher.runExclusive(async (ctx) => {
      writeFileSync(config, CANDIDATE);
      ctx.acknowledge([config]);
      ctx.reloadAfter([config]);
      await sleep(300);
      reloadsDuringEdit = reloads.length;
    }, 5000);
    await until(() => reloads.length > 0);
    await watcher.settled();

    expect(reloadsDuringEdit).toBe(0);
    expect(reloads.map(baseURLOf)).toEqual(["candidate.example.com"]);
  });

  it("settles its edits without waiting for the reload queued behind them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deep, watcher, reloads } = await watched();
    let editDone = false;

    const edit = watcher.runExclusive(async (ctx) => {
      writeFileSync(
        deep,
        'await new Promise((r) => setTimeout(r, 1500))\nexport const host = "slow.example.com"\n',
      );
      ctx.acknowledge([deep]);
      ctx.reloadAfter([deep]);
      editDone = true;
    }, 5000);
    await edit;
    await watcher.editsSettled();

    expect(editDone).toBe(true);
    expect(reloads).toEqual([]);
    await watcher.settled();
    expect(reloads.map(baseURLOf)).toEqual(["slow.example.com"]);
  });

  it("refuses to load for an edit once Studio is stopping", async () => {
    const { watcher } = await watched();
    watcher.stop();

    const failure = await watcher.runExclusive(
      (ctx) => ctx.load().catch((err: unknown) => err),
      1000,
    );

    expect(failure).toMatchObject({ code: "CONFIG_WATCHER_STOPPED" });
  });
});

describe("startConfigWatcher — a file that takes precedence", () => {
  it("reloads when a mocks file is created under a name that wins over the one loaded", async () => {
    const project = makeProject();
    writeFileSync(join(project.root, "courier.mocks.mts"), "export default { fromMts: {} };\n");
    const { watcher, applied } = start(project.root);
    await watcher.settled();
    expect(Object.keys(applied[0]?.mocks.entries ?? {})).toEqual(["fromMts"]);
    await sleep(SETTLE_MS);

    writeFileSync(join(project.root, "courier.mocks.ts"), "export default { fromTs: {} };\n");
    await until(() => applied.length > 1);

    expect(Object.keys(applied.at(-1)?.mocks.entries ?? {})).toEqual(["fromTs"]);
  });
});

describe("startConfigWatcher — a load that fails", () => {
  it("reports each failure in order, and keeps what it ran until a load succeeds", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const project = makeProject();
    writeFileSync(project.config, "export default {}\n");
    const { watcher, applied, failed, current } = start(project.root);
    await watcher.settled();
    expect(failed).toMatchObject([{ code: "CONFIG_INVALID" }]);
    await sleep(SETTLE_MS);

    writeFileSync(
      project.config,
      'import { api } from "./src/api"\nexport default { sources: { demo: api } }\n',
    );
    await until(() => applied.length > 0);
    expect(baseURLOf(current())).toBe("v1.example.com");

    writeFileSync(project.config, "export default {}\n");
    await until(() => failed.length > 1);
    expect(failed[1]).toMatchObject({ code: "CONFIG_INVALID" });
    expect(baseURLOf(current())).toBe("v1.example.com");
  });

  it("loads a config created after a first load found none", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = realpathSync(mkdtempSync(join(tmpdir(), "config-watcher-none-")));
    roots.push(root);
    const { watcher, applied, failed } = start(root);
    await watcher.settled();
    expect(failed).toMatchObject([{ code: "CONFIG_NOT_FOUND" }]);
    await sleep(SETTLE_MS);

    writeFileSync(join(root, "courier.config.ts"), CANDIDATE);
    await until(() => applied.length > 0);

    expect(baseURLOf(applied[0])).toBe("candidate.example.com");
  });

  it("tries again when a mocks file is created in a project whose first load failed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = realpathSync(mkdtempSync(join(tmpdir(), "config-watcher-none-")));
    roots.push(root);
    const { watcher, failed } = start(root);
    await watcher.settled();
    await sleep(SETTLE_MS);

    writeFileSync(join(root, "courier.mocks.ts"), "export default {};\n");
    await until(() => failed.length > 1);

    expect(failed).toMatchObject([{ code: "CONFIG_NOT_FOUND" }, { code: "CONFIG_NOT_FOUND" }]);
  });
});

/**
 * A save that lands while a load runs, before anything watches the file it
 * changed, is still reloaded: each file is compared, once watched, with the
 * bytes the load read before evaluating.
 */
describe("startConfigWatcher — a change made while it loads", () => {
  it("a save made while the first load evaluates a module is loaded once that load ends", async () => {
    const { root, deep } = makeProject();
    const marker = slowModule(deep, 'export const host = "v1.example.com"');
    const { watcher, applied } = start(root);
    await until(() => Reflect.get(globalThis, marker) === true);
    expect(Reflect.get(globalThis, marker)).toBe(true);

    writeFileSync(deep, 'export const host = "v2.example.com"\n');
    await until(() => baseURLOf(applied.at(-1)) === "v2.example.com");
    await sleep(1000);
    await watcher.settled();

    expect(applied.map(baseURLOf)).toEqual(["v1.example.com", "v2.example.com"]);
  });

  it("a module the reload is first to import, saved while it loads, is loaded once the reload ends", async () => {
    const { root, config } = makeProject();
    const { watcher, applied } = start(root);
    await watcher.settled();
    await sleep(SETTLE_MS);
    const added = join(root, "src", "added.ts");
    const marker = slowModule(added, 'export const host = "added-v1.example.com"');

    writeFileSync(
      config,
      'import { host } from "./src/added"\nexport default { sources: { demo: { baseURL: host } } }\n',
    );
    await until(() => Reflect.get(globalThis, marker) === true);
    expect(Reflect.get(globalThis, marker)).toBe(true);
    writeFileSync(added, 'export const host = "added-v2.example.com"\n');
    await until(() => baseURLOf(applied.at(-1)) === "added-v2.example.com");

    expect(baseURLOf(applied.at(-1))).toBe("added-v2.example.com");
  });

  it("a mocks file saved during the first load is loaded, and its content hash is known", async () => {
    const { root, deep } = makeProject();
    writeFileSync(join(root, "courier.mocks.ts"), "export default { before: {} };\n");
    const marker = slowModule(deep, 'export const host = "v1.example.com"');
    const { applied } = start(root);
    await until(() => Reflect.get(globalThis, marker) === true);
    expect(Reflect.get(globalThis, marker)).toBe(true);

    const saved = "export default { saved: {} };\n";
    writeFileSync(join(root, "courier.mocks.ts"), saved);
    await until(() => applied.at(-1)?.mocks.contentHash === sha256(saved));

    expect(Object.keys(applied.at(-1)?.mocks.entries ?? {})).toEqual(["saved"]);
    expect(applied.at(-1)?.mocks.contentHash).toBe(sha256(saved));
  });

  it("a config file that takes precedence, created during the first load, is loaded", async () => {
    const { root, config, deep } = makeProject();
    renameSync(config, join(root, "courier.config.mts"));
    const marker = slowModule(deep, 'export const host = "v1.example.com"');
    const { applied } = start(root);
    await until(() => Reflect.get(globalThis, marker) === true);
    expect(Reflect.get(globalThis, marker)).toBe(true);

    writeFileSync(config, CANDIDATE);
    await until(() => baseURLOf(applied.at(-1)) === "candidate.example.com");

    expect(baseURLOf(applied[0])).toBe("v1.example.com");
    expect(applied.at(-1)?.configFile).toBe(config);
  });

  it("fixing a module that made the first load fail reloads the config", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { root, deep } = makeProject();
    writeFileSync(deep, 'throw new Error("deep does not load")\n');
    const { watcher, applied, failed } = start(root);
    await watcher.settled();
    expect(failed).toMatchObject([{ code: "CONFIG_INVALID" }]);
    await sleep(SETTLE_MS);

    writeFileSync(deep, 'export const host = "fixed.example.com"\n');
    await until(() => applied.length > 0);

    expect(baseURLOf(applied[0])).toBe("fixed.example.com");
  });

  it("fixing a module that a failing reload newly imports reloads the config", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { root, config } = makeProject();
    const { watcher, applied, failed } = start(root);
    await watcher.settled();
    await sleep(SETTLE_MS);
    const broken = join(root, "src", "broken.ts");
    writeFileSync(broken, 'throw new Error("broken does not load")\n');

    writeFileSync(
      config,
      'import { host } from "./src/broken"\nexport default { sources: { demo: { baseURL: host } } }\n',
    );
    await until(() => failed.length > 0);
    expect(failed).toMatchObject([{ code: "CONFIG_INVALID" }]);
    await sleep(SETTLE_MS);
    writeFileSync(broken, 'export const host = "fixed.example.com"\n');
    await until(() => baseURLOf(applied.at(-1)) === "fixed.example.com");

    expect(baseURLOf(applied.at(-1))).toBe("fixed.example.com");
  });

  it("restoring a module that a failed reload could not find reloads the config", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { root, deep } = makeProject();
    const { watcher, applied, failed } = start(root);
    await watcher.settled();
    await sleep(SETTLE_MS);

    unlinkSync(deep);
    await until(() => failed.length > 0);
    expect(failed).toMatchObject([{ code: "CONFIG_INVALID" }]);
    await sleep(SETTLE_MS);
    writeFileSync(deep, 'export const host = "restored.example.com"\n');
    await until(() => baseURLOf(applied.at(-1)) === "restored.example.com");

    expect(baseURLOf(applied.at(-1))).toBe("restored.example.com");
  });

  it("a generator that deletes and rewrites its output directory ends loaded", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { root, config } = makeProject();
    const generated = join(root, "generated");
    const generate = (host: string) => {
      mkdirSync(generated, { recursive: true });
      writeFileSync(join(generated, "host.ts"), `export const host = "${host}"\n`);
      writeFileSync(
        join(generated, "index.ts"),
        'import { host } from "./host"\nexport const api = { baseURL: host }\n',
      );
    };
    generate("generated-v1.example.com");
    writeFileSync(
      config,
      'import { api } from "./generated"\nexport default { sources: { demo: api } }\n',
    );
    const { watcher, applied, failed } = start(root);
    await watcher.settled();
    expect(baseURLOf(applied[0])).toBe("generated-v1.example.com");
    await sleep(SETTLE_MS);

    rmSync(generated, { recursive: true, force: true });
    await until(() => failed.length > 0);
    expect(failed.length).toBeGreaterThan(0);
    generate("generated-v2.example.com");
    await until(() => baseURLOf(applied.at(-1)) === "generated-v2.example.com");

    expect(baseURLOf(applied.at(-1))).toBe("generated-v2.example.com");
  });

  it("a file that is not valid UTF-8 does not reload over and over", async () => {
    const { root, deep } = makeProject();
    writeFileSync(
      deep,
      Buffer.concat([
        Buffer.from('export const host = "v1.example.com"\n// caf'),
        Buffer.from([0xe9, 0x0a]),
      ]),
    );
    const { watcher, applied, failed } = start(root);
    await watcher.settled();
    await sleep(1500);
    await watcher.settled();

    expect(applied.map(baseURLOf)).toEqual(["v1.example.com"]);
    expect(failed).toEqual([]);
  });
});

describe("startConfigWatcher — a save during a reload", () => {
  it("a save during a reload is loaded exactly once more", async () => {
    const { root, deep } = makeProject();
    const { watcher, applied } = start(root);
    await watcher.settled();
    await sleep(SETTLE_MS);
    const marker = slowModule(deep, 'export const host = "v2.example.com"');
    await until(() => Reflect.get(globalThis, marker) === true);
    expect(Reflect.get(globalThis, marker)).toBe(true);

    writeFileSync(deep, 'export const host = "v3.example.com"\n');
    await until(() => baseURLOf(applied.at(-1)) === "v3.example.com");
    await sleep(1500);
    await watcher.settled();

    expect(applied.map(baseURLOf)).toEqual(["v1.example.com", "v2.example.com", "v3.example.com"]);
  });

  it("a save whose notification still waits when a load reads it is loaded once more, as the notification may stand for a version in between", async () => {
    const { root, deep } = makeProject();
    const { watcher, applied } = start(root);
    await watcher.settled();
    await sleep(SETTLE_MS);

    writeFileSync(deep, 'export const host = "saved.example.com"\n');
    await watcher.runExclusive(async (ctx) => {
      ctx.apply(await ctx.load());
    }, 5000);
    await sleep(1500);
    await watcher.settled();

    expect(applied.map(baseURLOf)).toEqual([
      "v1.example.com",
      "saved.example.com",
      "saved.example.com",
    ]);
  });

  it("a watched module changed and restored while a load evaluates ends loaded as it is on disk", async () => {
    const { root, config } = makeProject();
    const gate = join(root, "src", "gate.ts");
    const shared = join(root, "src", "shared.ts");
    const restored = 'export const host = "restored.example.com"\n';
    writeFileSync(gate, "export const open = true\n");
    writeFileSync(shared, restored);
    writeFileSync(
      config,
      'import { open } from "./src/gate"\nimport { host } from "./src/shared"\nexport default { sources: { demo: { baseURL: open ? host : "closed" } } }\n',
    );
    const { watcher, applied } = start(root);
    await watcher.settled();
    await sleep(SETTLE_MS);

    const reloading = slowModule(gate, "export const open = true");
    await until(() => Reflect.get(globalThis, reloading) === true);
    expect(Reflect.get(globalThis, reloading)).toBe(true);
    const between = slowModule(shared, 'export const host = "between.example.com"');
    await until(() => Reflect.get(globalThis, between) === true);
    expect(Reflect.get(globalThis, between)).toBe(true);
    writeFileSync(shared, restored);
    await until(
      () => applied.length > 2 && baseURLOf(applied.at(-1)) === "restored.example.com",
      3000,
    );
    await sleep(SETTLE_MS);
    await watcher.settled();

    expect(applied.map(baseURLOf)).toContain("between.example.com");
    expect(baseURLOf(applied.at(-1))).toBe("restored.example.com");
  });

  it("an edit Studio writes and acknowledges is not reloaded again", async () => {
    const { root } = makeProject();
    const { watcher, applied } = start(root);
    await watcher.settled();
    await sleep(SETTLE_MS);
    const mocksFile = join(root, "courier.mocks.ts");

    await watcher.runExclusive(async (ctx) => {
      writeFileSync(mocksFile, "export default { written: {} };\n");
      ctx.acknowledge([mocksFile]);
      ctx.apply(await ctx.load());
    }, 5000);
    await sleep(1500);
    await watcher.settled();

    expect(applied.map((loaded) => Object.keys(loaded.mocks.entries))).toEqual([[], ["written"]]);
  });
});

/**
 * An import that names no module when a load reads the project is watched at
 * every path the module could be created at, so creating it reloads — whether
 * the load then failed for want of it, or found it after all because it
 * appeared once the dependency walk had looked.
 */
describe("startConfigWatcher — an import that names no module yet", () => {
  it("a module created while the first load evaluates, after the walk looked for it, is watched once that load ends", async () => {
    const { root, config } = makeProject();
    const late = join(root, "src", "late.ts");
    const marker = slowModule(join(root, "src", "slow.ts"), "export const ready = true");
    writeFileSync(
      config,
      'import { ready } from "./src/slow"\nimport { host } from "./src/late"\nexport default { sources: { demo: { baseURL: ready ? host : "not ready" } } }\n',
    );
    const { watcher, applied } = start(root);
    await until(() => Reflect.get(globalThis, marker) === true);
    expect(Reflect.get(globalThis, marker)).toBe(true);

    writeFileSync(late, 'export const host = "late-v1.example.com"\n');
    await until(() => applied.length > 0);
    await watcher.settled();
    await sleep(SETTLE_MS);
    await watcher.settled();
    writeFileSync(late, 'export const host = "late-v2.example.com"\n');
    await until(() => baseURLOf(applied.at(-1)) === "late-v2.example.com", 3000);

    expect(baseURLOf(applied[0])).toBe("late-v1.example.com");
    expect(baseURLOf(applied.at(-1))).toBe("late-v2.example.com");
  });

  it("a module a reload is first to import, created while it evaluates, is watched once the reload ends", async () => {
    const { root, config } = makeProject();
    const { watcher, applied } = start(root);
    await watcher.settled();
    await sleep(SETTLE_MS);
    const created = join(root, "src", "created.ts");
    const marker = slowModule(join(root, "src", "gate.ts"), "export const open = true");

    writeFileSync(
      config,
      'import { open } from "./src/gate"\nimport { host } from "./src/created"\nexport default { sources: { demo: { baseURL: open ? host : "closed" } } }\n',
    );
    await until(() => Reflect.get(globalThis, marker) === true);
    expect(Reflect.get(globalThis, marker)).toBe(true);
    writeFileSync(created, 'export const host = "created-v1.example.com"\n');
    await until(() => baseURLOf(applied.at(-1)) === "created-v1.example.com");
    await watcher.settled();
    await sleep(SETTLE_MS);
    await watcher.settled();
    writeFileSync(created, 'export const host = "created-v2.example.com"\n');
    await until(() => baseURLOf(applied.at(-1)) === "created-v2.example.com", 3000);

    expect(baseURLOf(applied.at(-1))).toBe("created-v2.example.com");
  });

  it("creating a module the first load could not find reloads the config", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { root, config } = makeProject();
    writeFileSync(
      config,
      'import { host } from "./src/missing"\nexport default { sources: { demo: { baseURL: host } } }\n',
    );
    const { watcher, applied, failed } = start(root);
    await watcher.settled();
    expect(failed).toMatchObject([{ code: "CONFIG_INVALID" }]);
    await sleep(SETTLE_MS);

    writeFileSync(join(root, "src", "missing.ts"), 'export const host = "created.example.com"\n');
    await until(() => applied.length > 0, 3000);

    expect(baseURLOf(applied[0])).toBe("created.example.com");
  });

  it("creating the directory an import names, and the module in it, reloads the config", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { root, config } = makeProject();
    writeFileSync(
      config,
      'import { api } from "./generated/api"\nexport default { sources: { demo: api } }\n',
    );
    const { watcher, applied, failed } = start(root);
    await watcher.settled();
    expect(failed).toMatchObject([{ code: "CONFIG_INVALID" }]);
    await sleep(SETTLE_MS);

    mkdirSync(join(root, "generated"));
    writeFileSync(
      join(root, "generated", "api.ts"),
      'export const api = { baseURL: "generated.example.com" }\n',
    );
    await until(() => applied.length > 0, 3000);

    expect(baseURLOf(applied[0])).toBe("generated.example.com");
  });
});

/** A project made of `files`, each path relative to its root. */
function projectOf(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "config-watcher-resolution-")));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const petsAt = (host: string) => `export const pets = { baseURL: "${host}" }\n`;
const configImporting = (specifier: string) =>
  `import { pets } from "${specifier}"\nexport default { sources: { demo: pets } }\n`;
const pathsTo = (target: string) =>
  JSON.stringify({ compilerOptions: { paths: { "@/*": [target] } } });

/**
 * The module watched is the module the loader runs. With a compiled `.js`
 * beside a `.ts`, an extensionless import runs the `.js`; an import written
 * for NodeNext as `./pets.js` runs `pets.ts` when there is no `pets.js`.
 */
describe("startConfigWatcher — the module the loader runs", () => {
  it("reloads for an edit to the .js the loader runs beside a .ts, and runs the edit", async () => {
    const root = projectOf({
      "src/pets.ts": petsAt("ts-v1.example.com"),
      "src/pets.js": petsAt("js-v1.example.com"),
      "courier.config.ts": configImporting("./src/pets"),
    });
    const { watcher, applied } = start(root);
    await watcher.settled();
    expect(baseURLOf(applied[0])).toBe("js-v1.example.com");
    await sleep(SETTLE_MS);

    writeFileSync(join(root, "src", "pets.js"), petsAt("js-v2.example.com"));
    await until(() => applied.length > 1, 3000);

    expect(baseURLOf(applied.at(-1))).toBe("js-v2.example.com");
  });

  it("reloads when the .js beside a .ts is deleted, and runs the .ts", async () => {
    const root = projectOf({
      "src/pets.ts": petsAt("ts-v1.example.com"),
      "src/pets.js": petsAt("js-v1.example.com"),
      "courier.config.ts": configImporting("./src/pets"),
    });
    const { watcher, applied } = start(root);
    await watcher.settled();
    await sleep(SETTLE_MS);

    unlinkSync(join(root, "src", "pets.js"));
    await until(() => applied.length > 1, 3000);

    expect(baseURLOf(applied.at(-1))).toBe("ts-v1.example.com");
  });

  it("reloads for an edit to the .ts a NodeNext .js import runs", async () => {
    const root = projectOf({
      "src/pets.ts": petsAt("ts-v1.example.com"),
      "courier.config.ts": configImporting("./src/pets.js"),
    });
    const { watcher, applied } = start(root);
    await watcher.settled();
    expect(baseURLOf(applied[0])).toBe("ts-v1.example.com");
    await sleep(SETTLE_MS);

    writeFileSync(join(root, "src", "pets.ts"), petsAt("ts-v2.example.com"));
    await until(() => applied.length > 1, 3000);

    expect(baseURLOf(applied.at(-1))).toBe("ts-v2.example.com");
  });

  it("reloads when a .js the loader takes first is created beside the .ts it runs, and runs the .js", async () => {
    const root = projectOf({
      "src/pets.ts": petsAt("ts-v1.example.com"),
      "courier.config.ts": configImporting("./src/pets"),
    });
    const { watcher, applied } = start(root);
    await watcher.settled();
    expect(baseURLOf(applied[0])).toBe("ts-v1.example.com");
    await sleep(SETTLE_MS);

    writeFileSync(join(root, "src", "pets.js"), petsAt("js-v1.example.com"));
    await until(() => applied.length > 1, 3000);

    expect(baseURLOf(applied.at(-1))).toBe("js-v1.example.com");
  });

  it("catches up with a .js the loader takes first, created beside the .ts it runs", async () => {
    const root = projectOf({
      "src/pets.ts": petsAt("ts-v1.example.com"),
      "courier.config.ts": configImporting("./src/pets.js"),
    });
    const { watcher, applied } = start(root);
    await watcher.settled();
    expect(baseURLOf(applied[0])).toBe("ts-v1.example.com");

    writeFileSync(join(root, "src", "pets.js"), petsAt("js-v1.example.com"));

    expect(await watcher.catchUp(Date.now() + 3000)).toBe(true);
    expect(baseURLOf(applied.at(-1))).toBe("js-v1.example.com");
  });
});

/**
 * The tsconfig an alias is read from is as much an input of the load as the
 * module it names: an edit to it sends the import to another module.
 */
describe("startConfigWatcher — tsconfig paths", () => {
  const twoTargets = {
    "src/pets.ts": petsAt("src.example.com"),
    "src2/pets.ts": petsAt("src2.example.com"),
    "courier.config.ts": configImporting("@/pets"),
  };

  it("reloads when the alias is pointed at another directory, and runs the module there", async () => {
    const root = projectOf({ ...twoTargets, "tsconfig.json": pathsTo("./src/*") });
    const { watcher, applied } = start(root);
    await watcher.settled();
    expect(baseURLOf(applied[0])).toBe("src.example.com");
    await sleep(SETTLE_MS);

    writeFileSync(join(root, "tsconfig.json"), pathsTo("./src2/*"));
    await until(() => applied.length > 1, 3000);

    expect(baseURLOf(applied.at(-1))).toBe("src2.example.com");
  });

  it("reloads when the alias a failed load could not resolve is added", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = projectOf({ ...twoTargets, "tsconfig.json": "{}" });
    const { watcher, applied, failed } = start(root);
    await watcher.settled();
    expect(failed).toMatchObject([{ code: "CONFIG_INVALID" }]);
    await sleep(SETTLE_MS);

    writeFileSync(join(root, "tsconfig.json"), pathsTo("./src/*"));
    await until(() => applied.length > 0, 3000);

    expect(baseURLOf(applied[0])).toBe("src.example.com");
  });

  it("reloads when a tsconfig whose paths the alias reader cannot read at the first load is fixed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const malformed = JSON.stringify({ compilerOptions: { paths: { "@/*": "./src/*" } } });
    const root = projectOf({ ...twoTargets, "tsconfig.json": malformed });
    const { watcher, applied, failed } = start(root);
    await watcher.settled();
    expect(failed).toHaveLength(1);
    await sleep(SETTLE_MS);

    writeFileSync(join(root, "tsconfig.json"), pathsTo("./src/*"));
    await until(() => applied.length > 0, 3000);

    expect(baseURLOf(applied[0])).toBe("src.example.com");
    expect(failed).toMatchObject([{ code: "CONFIG_INVALID" }]);
  });

  it("reloads when a tsconfig the nearest one extends changes the alias", async () => {
    const root = projectOf({
      ...twoTargets,
      "tsconfig.json": JSON.stringify({ extends: "./tsconfig.base.json" }),
      "tsconfig.base.json": pathsTo("./src/*"),
    });
    const { watcher, applied } = start(root);
    await watcher.settled();
    expect(baseURLOf(applied[0])).toBe("src.example.com");
    await sleep(SETTLE_MS);

    writeFileSync(join(root, "tsconfig.base.json"), pathsTo("./src2/*"));
    await until(() => applied.length > 1, 3000);

    expect(baseURLOf(applied.at(-1))).toBe("src2.example.com");
  });

  it("reloads when a tsconfig.json is created nearer than the one the alias was read from", async () => {
    const workspace = projectOf({
      "tsconfig.json": pathsTo("./app/src/*"),
      "app/src/pets.ts": petsAt("src.example.com"),
      "app/src2/pets.ts": petsAt("src2.example.com"),
      "app/courier.config.ts": configImporting("@/pets"),
    });
    const { watcher, applied } = start(join(workspace, "app"));
    await watcher.settled();
    expect(baseURLOf(applied[0])).toBe("src.example.com");
    await sleep(SETTLE_MS);

    writeFileSync(join(workspace, "app", "tsconfig.json"), pathsTo("./src2/*"));
    await until(() => applied.length > 1, 3000);

    expect(baseURLOf(applied.at(-1))).toBe("src2.example.com");
  });
});
