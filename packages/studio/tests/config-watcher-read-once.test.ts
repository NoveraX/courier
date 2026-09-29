/**
 * What a load depends on is read before it evaluates anything, and those
 * reads are what the files are compared with once watched, so a save landing
 * at any moment between the start of the load and the evaluation it leads to
 * is either loaded by that load or reloaded after it. The mocks file is read
 * once, and every name the config or the mocks file may take in the root is
 * read before either is looked for.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as OxcParser from "oxc-parser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedCourierConfig } from "../src/server/config-loader";
import { type ConfigWatcher, startConfigWatcher } from "../src/server/config-watcher";

/* Runs as the dependency walk parses each module: the only moment a test can
   act between the start of a load and the evaluation it leads to. */
const parsing = vi.hoisted(() => {
  const state: { hook: ((file: string) => void) | null } = { hook: null };
  return state;
});

vi.mock("oxc-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof OxcParser>();
  return {
    ...actual,
    parseSync: (...args: Parameters<typeof actual.parseSync>) => {
      parsing.hook?.(args[0]);
      return actual.parseSync(...args);
    },
  };
});

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let root: string;
let watcher: ConfigWatcher | null = null;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "config-watcher-read-once-")));
});

afterEach(() => {
  parsing.hook = null;
  watcher?.stop();
  watcher = null;
  rmSync(root, { recursive: true, force: true });
});

async function until(condition: () => boolean, budgetMs = 5000): Promise<void> {
  for (let waited = 0; waited < budgetMs && !condition(); waited += 25) await sleep(25);
}

describe("startConfigWatcher — the mocks file", () => {
  it("a mocks file saved between the start of the load and its evaluation is reloaded", async () => {
    mkdirSync(join(root, "src"));
    const config = join(root, "courier.config.ts");
    const mocksFile = join(root, "courier.mocks.ts");
    writeFileSync(
      join(root, "src", "api.ts"),
      'export const api = { baseURL: "v1.example.com" }\n',
    );
    writeFileSync(
      config,
      'import { api } from "./src/api"\nexport default { sources: { demo: api } }\n',
    );
    writeFileSync(mocksFile, "export default { before: {} };\n");
    const saved = "export default { saved: {} };\n";
    parsing.hook = (file) => {
      if (file !== config) return;
      parsing.hook = null;
      writeFileSync(mocksFile, saved);
    };
    const applied: LoadedCourierConfig[] = [];
    const failed: unknown[] = [];

    watcher = startConfigWatcher({
      projectRoot: root,
      current: () => applied.at(-1) ?? null,
      onApplied: (loaded) => applied.push(loaded),
      onFailed: (error) => failed.push(error),
    });
    await until(() => applied.at(-1)?.mocks.contentHash === sha256(saved));

    expect(parsing.hook).toBeNull();
    expect(failed).toEqual([]);
    expect(Object.keys(applied.at(-1)?.mocks.entries ?? {})).toEqual(["saved"]);
    expect(applied.at(-1)?.mocks.contentHash).toBe(sha256(saved));
  });
});

describe("startConfigWatcher — a file that takes precedence, created during the walk", () => {
  function start(): { applied: LoadedCourierConfig[] } {
    const applied: LoadedCourierConfig[] = [];
    watcher = startConfigWatcher({
      projectRoot: root,
      current: () => applied.at(-1) ?? null,
      onApplied: (loaded) => applied.push(loaded),
      onFailed: () => {},
    });
    return { applied };
  }

  it("a config file that takes precedence, created while the first load walks its modules, is loaded", async () => {
    mkdirSync(join(root, "src"));
    const api = join(root, "src", "api.ts");
    const config = join(root, "courier.config.ts");
    writeFileSync(api, 'export const host = "mts.example.com"\n');
    writeFileSync(
      join(root, "courier.config.mts"),
      'import { host } from "./src/api"\nexport default { sources: { demo: { baseURL: host } } }\n',
    );
    parsing.hook = (file) => {
      if (file !== api) return;
      parsing.hook = null;
      writeFileSync(
        config,
        'export default { sources: { demo: { baseURL: "ts.example.com" } } }\n',
      );
    };

    const { applied } = start();
    await until(() => applied.at(-1)?.configFile === config, 3000);

    expect(parsing.hook).toBeNull();
    expect(applied.at(-1)?.configFile).toBe(config);
    expect(applied.at(-1)?.config.sources).toMatchObject({ demo: { baseURL: "ts.example.com" } });
  });

  it("a mocks file that takes precedence, created while the first load walks its modules, is loaded", async () => {
    mkdirSync(join(root, "src"));
    const api = join(root, "src", "api.ts");
    writeFileSync(api, 'export const host = "v1.example.com"\n');
    writeFileSync(
      join(root, "courier.config.ts"),
      'import { host } from "./src/api"\nexport default { sources: { demo: { baseURL: host } } }\n',
    );
    writeFileSync(join(root, "courier.mocks.mts"), "export default { lower: {} };\n");
    parsing.hook = (file) => {
      if (file !== api) return;
      parsing.hook = null;
      writeFileSync(join(root, "courier.mocks.ts"), "export default { higher: {} };\n");
    };

    const { applied } = start();
    await until(() => Object.keys(applied.at(-1)?.mocks.entries ?? {}).includes("higher"), 3000);

    expect(parsing.hook).toBeNull();
    expect(applied.at(-1)?.mocks.file).toBe(join(root, "courier.mocks.ts"));
    expect(Object.keys(applied.at(-1)?.mocks.entries ?? {})).toEqual(["higher"]);
  });
});
