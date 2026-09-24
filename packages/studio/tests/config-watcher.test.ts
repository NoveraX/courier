import {
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
import { join } from "node:path";
import type { CourierConfig } from "@noverax/courier/config";
import type { Namespace } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BindingTable } from "../src/server/catalog/binding-table";
import { type LoadedCourierConfig, loadCourierConfig } from "../src/server/config-loader";
import { type ConfigWatcher, startConfigWatcher } from "../src/server/config-watcher";
import { studioTransformCache } from "../src/server/studio-transform-cache";

function makeLoaded(deps: string[]): LoadedCourierConfig {
  const config = { sources: {} } as unknown as CourierConfig;
  const mocks = { file: null, entries: {}, contentHash: null, error: null };
  return { config, configFile: deps[0] ?? "", contentHash: null, deps, mocks };
}

let watchers: ConfigWatcher[] = [];
let roots: string[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Long enough for a native notification to arrive and a reload to run. */
const SETTLE_MS = 250;

function start(initial: LoadedCourierConfig | null, deps: Parameters<typeof startConfigWatcher>[1]) {
  const watcher = startConfigWatcher(initial, deps);
  watchers.push(watcher);
  return watcher;
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
  writeFileSync(config, 'import { api } from "./src/api"\nexport default { sources: { demo: api } }\n');
  return { root, config, direct, deep };
}

function baseURLOf(loaded: LoadedCourierConfig | null | undefined): unknown {
  return (loaded?.config.sources as Record<string, { baseURL?: unknown }> | undefined)?.demo?.baseURL;
}

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
  it("returns the initial loaded config from getCurrent()", () => {
    const { root, config } = makeProject();
    const initial = makeLoaded([config]);
    const watcher = start(initial, { projectRoot: root, bindingTable: new BindingTable() });

    expect(watcher.getCurrent()).toBe(initial);
  });

  it("stop() is idempotent", () => {
    const { root, config } = makeProject();
    const watcher = startConfigWatcher(makeLoaded([config]), {
      projectRoot: root,
      bindingTable: new BindingTable(),
    });

    expect(() => {
      watcher.stop();
      watcher.stop();
    }).not.toThrow();
  });

  it("does not invoke onReload synchronously", () => {
    const { root, config } = makeProject();
    const onReload = vi.fn();
    start(makeLoaded([config]), {
      projectRoot: root,
      bindingTable: new BindingTable(),
      onReload,
    });

    expect(onReload).not.toHaveBeenCalled();
  });
});

/**
 * The behaviour the watcher exists for. Each case drives the real filesystem
 * and the real loader — a change that does not reach `onReload` here is a
 * change a developer would not see in the Studio.
 */
describe("startConfigWatcher — reload", () => {
  async function watchProject() {
    const project = makeProject();
    const initial = await loadCourierConfig(project.root);
    const reloads: LoadedCourierConfig[] = [];
    start(initial, {
      projectRoot: project.root,
      bindingTable: new BindingTable(),
      onReload: (loaded) => reloads.push(loaded),
    });
    await sleep(SETTLE_MS);
    return { ...project, initial, reloads };
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

    expect(baseURLOf((await nextReload(reloads)) as LoadedCourierConfig)).toBe("v2.example.com");
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

    expect(baseURLOf((await nextReload(reloads)) as LoadedCourierConfig)).toBe("v2.example.com");
    expect(computed).toEqual([deep]);
  });

  it("keeps working after an editor replaces a file rather than writing it", async () => {
    const { root, deep, reloads } = await watchProject();

    const temp = join(root, "src", "deep.tmp");
    writeFileSync(temp, 'export const host = "atomic.example.com"\n');
    renameSync(temp, deep);
    expect(baseURLOf((await nextReload(reloads)) as LoadedCourierConfig)).toBe("atomic.example.com");

    writeFileSync(deep, 'export const host = "after-atomic.example.com"\n');

    expect(baseURLOf((await nextReload(reloads)) as LoadedCourierConfig)).toBe(
      "after-atomic.example.com",
    );
  });

  it("watches a module the config has only just started importing", async () => {
    const { root, config, reloads } = await watchProject();

    const added = join(root, "src", "added.ts");
    writeFileSync(added, 'export const host = "added.example.com"\n');
    writeFileSync(config, 'import { host } from "./src/added"\nexport default { sources: { demo: { baseURL: host } } }\n');
    const afterImport = await nextReload(reloads);
    expect(baseURLOf(afterImport as LoadedCourierConfig)).toBe("added.example.com");
    expect((afterImport as LoadedCourierConfig).deps).toContain(added);

    writeFileSync(added, 'export const host = "added-edited.example.com"\n');

    expect(baseURLOf((await nextReload(reloads)) as LoadedCourierConfig)).toBe(
      "added-edited.example.com",
    );
  });

  it("reports the tracked count and each change to the watcher status", async () => {
    const project = makeProject();
    const initial = await loadCourierConfig(project.root);
    const setApiPathCount = vi.fn();
    const emitChange = vi.fn();
    start(initial, {
      projectRoot: project.root,
      bindingTable: new BindingTable(),
      watcherStatus: {
        setApiPathCount,
        emitChange,
        setMockFileCount: vi.fn(),
        sendSnapshot: vi.fn(),
      },
    });
    await sleep(SETTLE_MS);
    expect(setApiPathCount).toHaveBeenCalledWith(initial.deps.length);

    writeFileSync(project.deep, 'export const host = "counted.example.com"\n');
    /* Waiting for the first call alone would be hostage to a late notification
       about the fixture's own creation arriving ahead of the edit. */
    const reported = () =>
      emitChange.mock.calls.some(
        ([kind, paths]) => kind === "api" && (paths as string[]).includes(project.deep),
      );
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

    const initial = await loadCourierConfig(project);
    expect(initial.deps).toContain(shared);

    const reloads: LoadedCourierConfig[] = [];
    start(initial, {
      projectRoot: project,
      bindingTable: new BindingTable(),
      onReload: (loaded) => reloads.push(loaded),
    });
    await sleep(SETTLE_MS);

    writeFileSync(shared, 'export const api = { baseURL: "v2.example.com" }\n');

    expect(baseURLOf((await nextReload(reloads)) as LoadedCourierConfig)).toBe("v2.example.com");
  });

  it("keeps the last good config when a dep is deleted, and recovers when it returns", async () => {
    const { deep, initial, reloads } = await watchProject();
    const watcher = watchers[watchers.length - 1] as ConfigWatcher;

    unlinkSync(deep);
    await sleep(1200);
    /* What matters is that the Studio still holds a working config, not that
       it holds the same object: the loader may serve the vanished module from
       its own cache and hand back an equal config under a new identity. */
    expect(baseURLOf(watcher.getCurrent() as LoadedCourierConfig)).toBe(baseURLOf(initial));

    writeFileSync(deep, 'export const host = "restored.example.com"\n');

    expect(baseURLOf((await nextReload(reloads)) as LoadedCourierConfig)).toBe(
      "restored.example.com",
    );
  });
});

const CANDIDATE = 'export default { sources: { demo: { baseURL: "candidate.example.com" } } }\n';

describe("startConfigWatcher — one reload at a time, and edits", () => {
  async function watched() {
    const project = makeProject();
    const initial = await loadCourierConfig(project.root);
    const reloads: LoadedCourierConfig[] = [];
    const emit = vi.fn();
    const emitChange = vi.fn();
    const watcher = start(initial, {
      projectRoot: project.root,
      bindingTable: new BindingTable(),
      uiNamespace: { emit } as unknown as Namespace,
      watcherStatus: { setApiPathCount: vi.fn(), emitChange, setMockFileCount: vi.fn(), sendSnapshot: vi.fn() },
      onReload: (loaded) => reloads.push(loaded),
    });
    await sleep(SETTLE_MS);
    emitChange.mockClear();
    return { ...project, initial, reloads, emit, emitChange, watcher };
  }

  it("never lets a slow reload replace the one after it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deep, watcher, reloads, emitChange } = await watched();

    writeFileSync(deep, 'await new Promise((r) => setTimeout(r, 900))\nexport const host = "slow.example.com"\n');
    await until(() => emitChange.mock.calls.length > 0);
    await sleep(100);
    writeFileSync(deep, 'export const host = "fast.example.com"\n');
    await until(() => reloads.some((loaded) => baseURLOf(loaded) === "fast.example.com"));
    await sleep(1200);
    await watcher.settled();

    expect(baseURLOf(reloads.at(-1))).toBe("fast.example.com");
    expect(baseURLOf(watcher.getCurrent())).toBe("fast.example.com");
  });

  it("leaves Studio as it was when an edit loads a candidate and does not apply it", async () => {
    const { config, watcher, reloads, emit, initial } = await watched();
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
    expect(watcher.getCurrent()).toBe(initial);
    expect(watcher.lastLoadError()).toBeNull();
    expect(emit).not.toHaveBeenCalled();
  });

  it("applies what an edit accepts as a reload would, and does not reload again for its write", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { config, watcher, reloads, emit } = await watched();

    await watcher.runExclusive(async (ctx) => {
      writeFileSync(config, CANDIDATE);
      ctx.acknowledge([config]);
      ctx.apply(await ctx.load());
    }, 5000);
    await sleep(1500);
    await watcher.settled();

    expect(reloads.map(baseURLOf)).toEqual(["candidate.example.com"]);
    expect(baseURLOf(watcher.getCurrent())).toBe("candidate.example.com");
    expect(emit).toHaveBeenCalledWith("config:update", expect.anything());
  });

  it("abandons a load that takes too long, so the edit can undo its write before any reload", async () => {
    const { deep, watcher, reloads, initial } = await watched();
    const original = readFileSync(deep, "utf8");

    const failure = await watcher.runExclusive(async (ctx) => {
      writeFileSync(deep, 'await new Promise((r) => setTimeout(r, 1500))\nexport const host = "late.example.com"\n');
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
    expect(watcher.getCurrent()).toBe(initial);
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
      writeFileSync(deep, 'await new Promise((r) => setTimeout(r, 1500))\nexport const host = "slow.example.com"\n');
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

    const failure = await watcher.runExclusive((ctx) => ctx.load().catch((err: unknown) => err), 1000);

    expect(failure).toMatchObject({ code: "CONFIG_WATCHER_STOPPED" });
  });
});

describe("startConfigWatcher — a file that takes precedence", () => {
  it("reloads when a mocks file is created under a name that wins over the one loaded", async () => {
    const project = makeProject();
    writeFileSync(join(project.root, "courier.mocks.mts"), "export default { fromMts: {} };\n");
    const initial = await loadCourierConfig(project.root);
    const reloads: LoadedCourierConfig[] = [];
    start(initial, { projectRoot: project.root, bindingTable: new BindingTable(), onReload: (loaded) => reloads.push(loaded) });
    await sleep(SETTLE_MS);

    writeFileSync(join(project.root, "courier.mocks.ts"), "export default { fromTs: {} };\n");
    await until(() => reloads.length > 0);

    expect(Object.keys(reloads.at(-1)?.mocks.entries ?? {})).toEqual(["fromTs"]);
  });
});

describe("startConfigWatcher — the last load's failure", () => {
  it("reports why the config did not load until a load succeeds, and a later failure again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const project = makeProject();
    const initialError = new Error("did not load at launch");
    const watcher = start(null, { projectRoot: project.root, bindingTable: new BindingTable(), initialError });
    expect(watcher.lastLoadError()).toBe(initialError);
    await sleep(SETTLE_MS);

    writeFileSync(project.config, 'import { api } from "./src/api"\nexport default { sources: { demo: api } }\n// saved\n');
    await until(() => watcher.getCurrent() !== null);
    expect(watcher.lastLoadError()).toBeNull();

    writeFileSync(project.config, "export default {}\n");
    await until(() => watcher.lastLoadError() !== null);
    expect(watcher.lastLoadError()).toMatchObject({ code: "CONFIG_INVALID" });
    expect(baseURLOf(watcher.getCurrent())).toBe("v1.example.com");
  });
});
