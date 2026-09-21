import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CourierConfig } from "@noverax/courier/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BindingTable } from "../src/server/catalog/binding-table";
import { type LoadedCourierConfig, loadCourierConfig } from "../src/server/config-loader";
import { type ConfigWatcher, startConfigWatcher } from "../src/server/config-watcher";

function makeLoaded(deps: string[]): LoadedCourierConfig {
  const config = { sources: {} } as unknown as CourierConfig;
  return { config, configFile: deps[0] ?? "", deps };
}

let watchers: ConfigWatcher[] = [];
let roots: string[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Long enough for a native notification to arrive and a reload to run. */
const SETTLE_MS = 250;

function start(initial: LoadedCourierConfig, deps: Parameters<typeof startConfigWatcher>[1]) {
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

function baseURLOf(loaded: LoadedCourierConfig): unknown {
  return (loaded.config.sources as Record<string, { baseURL?: unknown }>).demo?.baseURL;
}

afterEach(() => {
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
    expect(watcher.getCurrent()).toBe(initial);

    writeFileSync(deep, 'export const host = "restored.example.com"\n');

    expect(baseURLOf((await nextReload(reloads)) as LoadedCourierConfig)).toBe(
      "restored.example.com",
    );
  });
});
