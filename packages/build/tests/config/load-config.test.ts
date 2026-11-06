/**
 * @vitest-environment node
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type * as JitiModule from "jiti";
import { createJiti } from "jiti";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCourierConfig, loadCourierConfigFile } from "../../src/config/load-config";
import { createTransformCache, type TransformCache } from "../../src/config/transform-cache";

vi.mock("jiti", async (importOriginal) => {
  const actual = await importOriginal<typeof JitiModule>();
  return { ...actual, createJiti: vi.fn(actual.createJiti) };
});

/**
 * The loader imports the config through jiti (`createConfigJiti`), which
 * transpiles a TypeScript config and resolves bare imports against the
 * nearest `node_modules`. Tests that write `defineApi(...)` inside the config
 * therefore need a symlinked node_modules pointing at the repo root (same
 * pattern as studio's own config-loader test). Simple fixtures without bare
 * imports don't need the symlink.
 */
const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../../node_modules");

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-load-config-"));
});

afterEach(() => {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

function writeConfig(relPath: string, body: string): void {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, body, "utf-8");
}

describe("loadCourierConfig — base loader", () => {
  it("returns null when no config file exists in the walk-up chain", async () => {
    const nested = join(dir, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    const result = await loadCourierConfig({ cwd: nested });
    expect(result).toBeNull();
  });

  it("loads a minimal config from the starting directory", async () => {
    writeConfig(
      "courier.config.ts",
      `export default { sources: { api: { options: { baseURL: "http://x" } } } };`,
    );
    const result = await loadCourierConfig({ cwd: dir });
    expect(result).not.toBeNull();
    expect(result?.configFile).toBe(realpathSync(resolve(join(dir, "courier.config.ts"))));
    expect(Object.keys(result?.config.sources ?? {})).toEqual(["api"]);
  });

  it("walks up multiple levels by default to find config at an ancestor", async () => {
    const deep = join(dir, "src", "app", "api");
    mkdirSync(deep, { recursive: true });
    writeConfig("courier.config.ts", `export default { sources: { walked: {} } };`);
    const result = await loadCourierConfig({ cwd: deep });
    expect(result).not.toBeNull();
    expect(Object.keys(result?.config.sources ?? {})).toEqual(["walked"]);
  });

  it("returns null (without walking up) when requireAtCwd is true and no local file exists", async () => {
    const deep = join(dir, "src", "app");
    mkdirSync(deep, { recursive: true });
    // Config only exists at the root — walk-up would find it, requireAtCwd must not.
    writeConfig("courier.config.ts", `export default { sources: { root: {} } };`);
    const result = await loadCourierConfig({ cwd: deep, requireAtCwd: true });
    expect(result).toBeNull();
  });

  it("returns the config when requireAtCwd is true and a local file exists", async () => {
    writeConfig("courier.config.ts", `export default { sources: { local: {} } };`);
    const result = await loadCourierConfig({ cwd: dir, requireAtCwd: true });
    expect(result).not.toBeNull();
    expect(Object.keys(result?.config.sources ?? {})).toEqual(["local"]);
  });

  it("throws, naming the cause, when a config that exists fails to load", async () => {
    writeConfig("courier.config.ts", `throw new Error("boom during import");`);
    await expect(loadCourierConfig({ cwd: dir })).rejects.toThrow("boom during import");
  });

  it("loads runtime.appOrigin field when present", async () => {
    writeConfig(
      "courier.config.ts",
      `export default {
        sources: { api: {} },
        runtime: { appOrigin: "http://localhost:3000" },
      };`,
    );
    const result = await loadCourierConfig({ cwd: dir });
    expect(result?.config.runtime?.appOrigin).toBe("http://localhost:3000");
  });

  it("resolves bare imports inside the config (defineApi integration)", async () => {
    // This test exercises the full jiti pipeline including node_modules
    // resolution — symmetric to how a user's real courier.config.ts would
    // import from @noverax/courier/define.
    symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
    writeConfig(
      "courier.config.ts",
      `import { defineApi } from "@noverax/courier/define";
       export default {
         sources: {
           stripe: defineApi({ baseURL: "https://api.example.com", endpoints: {} }),
         },
       };`,
    );
    const result = await loadCourierConfig({ cwd: dir });
    expect(result).not.toBeNull();
    expect(Object.keys(result?.config.sources ?? {})).toEqual(["stripe"]);
  });
});

interface CountingCache {
  cache: TransformCache;
  /** The file of every transform the cache had to compute, in order. */
  computed: string[];
}

function countingCache(): CountingCache {
  const inner = createTransformCache();
  const computed: string[] = [];
  const cache: TransformCache = {
    transform: (options, compute) =>
      inner.transform(options, (miss) => {
        computed.push(miss.filename ?? "");
        return compute(miss);
      }),
  };
  return { cache, computed };
}

describe("loadCourierConfig — transform cache", () => {
  let configFile: string;
  let sourcesFile: string;

  beforeEach(() => {
    writeConfig("sources.ts", "export const sources: Record<string, object> = { first: {} };\n");
    writeConfig(
      "courier.config.ts",
      'import { sources } from "./sources";\nexport default { sources };\n',
    );
    configFile = realpathSync(join(dir, "courier.config.ts"));
    sourcesFile = realpathSync(join(dir, "sources.ts"));
    vi.mocked(createJiti).mockClear();
  });

  it("a second load through one cache transforms nothing", async () => {
    const { cache, computed } = countingCache();

    await loadCourierConfig({ cwd: dir, transformCache: cache });
    const afterFirst = [...computed];
    const second = await loadCourierConfig({ cwd: dir, transformCache: cache });

    expect(afterFirst.sort()).toEqual([configFile, sourcesFile].sort());
    expect(computed).toHaveLength(afterFirst.length);
    expect(Object.keys(second?.config.sources ?? {})).toEqual(["first"]);
  });

  it("an edited module is transformed again and its edit is seen", async () => {
    const { cache, computed } = countingCache();
    await loadCourierConfig({ cwd: dir, transformCache: cache });
    const afterFirst = computed.length;

    writeConfig("sources.ts", "export const sources: Record<string, object> = { second: {} };\n");
    const edited = await loadCourierConfig({ cwd: dir, transformCache: cache });

    expect(afterFirst).toBe(2);
    expect(computed.slice(afterFirst)).toEqual([sourcesFile]);
    expect(Object.keys(edited?.config.sources ?? {})).toEqual(["second"]);
  });

  it("a load without a cache transforms every module every time, with jiti's caches off", async () => {
    const transformed: string[] = [];

    await loadCourierConfig({ cwd: dir, onModule: (file) => transformed.push(file) });
    await loadCourierConfig({ cwd: dir, onModule: (file) => transformed.push(file) });

    expect(transformed.sort()).toEqual([configFile, configFile, sourcesFile, sourcesFile].sort());
    for (const [, options] of vi.mocked(createJiti).mock.calls) {
      expect(options).toMatchObject({ moduleCache: false, fsCache: false });
    }
  });

  it("loadCourierConfigFile transforms through the cache it is given", async () => {
    const { cache, computed } = countingCache();

    await loadCourierConfigFile(configFile, { transformCache: cache });
    await loadCourierConfigFile(configFile, { transformCache: cache });

    expect(computed.sort()).toEqual([configFile, sourcesFile].sort());
  });
});

describe("loadCourierConfig — the project's transforms", () => {
  beforeEach(() => {
    /* The suite keeps no transforms on disk; these tests are about keeping them. */
    vi.stubEnv("COURIER_TRANSFORM_CACHE", "1");
    writeConfig("sources.ts", "export const sources: Record<string, object> = { first: {} };\n");
    writeConfig(
      "courier.config.ts",
      'import { sources } from "./sources";\nexport default { sources };\n',
    );
  });

  /* What a process that loads the project once finds kept, as a mock worker reads it. */
  function reader(): CountingCache {
    const directory = join(realpathSync(dir), "node_modules", ".cache", "courier", "transform");
    const inner = createTransformCache({ directory, readOnly: true, maxMemoryChars: 0 });
    const computed: string[] = [];
    const cache: TransformCache = {
      transform: (options, compute) =>
        inner.transform(options, (miss) => {
          computed.push(miss.filename ?? "");
          return compute(miss);
        }),
    };
    return { cache, computed };
  }

  it("are kept in node_modules/.cache, where the next process finds every one", async () => {
    mkdirSync(join(dir, "node_modules"));

    const loaded = await loadCourierConfig({ cwd: dir, projectTransforms: true });
    const next = reader();
    await loadCourierConfig({ cwd: dir, transformCache: next.cache });

    expect(Object.keys(loaded?.config.sources ?? {})).toEqual(["first"]);
    expect(next.computed).toEqual([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("are neither kept nor looked for in a project without node_modules", async () => {
    const loaded = await loadCourierConfig({ cwd: dir, projectTransforms: true });

    expect(Object.keys(loaded?.config.sources ?? {})).toEqual(["first"]);
    expect(existsSync(join(dir, "node_modules"))).toBe(false);
  });
});

describe("loadCourierConfigFile — path aliases", () => {
  beforeEach(() => {
    writeConfig(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { paths: { "@app/*": ["./src/*"] } } }),
    );
    writeConfig("src/origin.ts", 'export const origin = "project";\n');
    writeConfig("src/shared.ts", 'export const origin = "project";\n');
    writeConfig(
      "node_modules/@app/shared/package.json",
      JSON.stringify({ name: "@app/shared", main: "index.js" }),
    );
    writeConfig("node_modules/@app/shared/index.js", 'exports.origin = "installed";\n');
    writeConfig(
      "courier.config.ts",
      'import { origin } from "@app/origin";\nexport default { sources: { [origin]: {} } };\n',
    );
  });

  it("resolves through the project's path aliases by default", async () => {
    const { config } = await loadCourierConfigFile(join(dir, "courier.config.ts"));

    expect(Object.keys(config.sources ?? {})).toEqual(["project"]);
  });

  it("leaves the project's path aliases unfollowed when aliases are off", async () => {
    await expect(
      loadCourierConfigFile(join(dir, "courier.config.ts"), { aliases: false }),
    ).rejects.toThrow("@app/origin");
  });

  it("resolves an installed package of an aliased scope to the package", async () => {
    writeConfig(
      "courier.config.ts",
      'import { origin } from "@app/shared";\nexport default { sources: { [origin]: {} } };\n',
    );

    const { config } = await loadCourierConfigFile(join(dir, "courier.config.ts"));

    expect(Object.keys(config.sources ?? {})).toEqual(["installed"]);
  });
});

describe("loadCourierConfigFile — native imports", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sees an edit on the next load even when JITI_TRY_NATIVE asks for native imports first", async () => {
    vi.stubEnv("JITI_TRY_NATIVE", "true");
    writeConfig("courier.config.ts", "export default { sources: { first: {} } };\n");
    const first = await loadCourierConfigFile(join(dir, "courier.config.ts"));

    writeConfig("courier.config.ts", "export default { sources: { second: {} } };\n");
    const second = await loadCourierConfigFile(join(dir, "courier.config.ts"));

    expect(Object.keys(first.config.sources ?? {})).toEqual(["first"]);
    expect(Object.keys(second.config.sources ?? {})).toEqual(["second"]);
  });
});

describe("loadCourierConfigFile — around the config's code", () => {
  const ran = "__courierConfigRan";

  afterEach(() => {
    Reflect.deleteProperty(globalThis, ran);
  });

  it("calls beforeRun once the loader is made, before the config's code runs", async () => {
    writeConfig(
      "courier.config.ts",
      `(globalThis as Record<string, unknown>).${ran} = true;\nexport default { sources: {} };\n`,
    );
    const seenBefore: unknown[] = [];

    await loadCourierConfigFile(join(dir, "courier.config.ts"), {
      beforeRun: () => seenBefore.push(Reflect.get(globalThis, ran)),
    });

    expect(seenBefore).toEqual([undefined]);
    expect(Reflect.get(globalThis, ran)).toBe(true);
  });

  it("runs each transform the load makes through runTransform, and keeps what it returns", async () => {
    writeConfig("sources.ts", "export const sources: Record<string, object> = { first: {} };\n");
    writeConfig(
      "courier.config.ts",
      'import { sources } from "./sources";\nexport default { sources };\n',
    );
    let runs = 0;

    const { config } = await loadCourierConfigFile(join(dir, "courier.config.ts"), {
      runTransform: (transform) => {
        runs += 1;
        return transform();
      },
    });

    expect(runs).toBe(2);
    expect(Object.keys(config.sources ?? {})).toEqual(["first"]);
  });
});

describe("loadCourierConfigFile — a config exported as a promise", () => {
  /* A key no environment holds, put there for the test alone. */
  const KEY = "FAKE-0000-PROBE-SECRET";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hands back the config the promise settles to, as the runtime's loader does", async () => {
    writeConfig("courier.config.mjs", `export default Promise.resolve({ sources: {} });\n`);

    const { config } = await loadCourierConfigFile(join(dir, "courier.config.mjs"));

    expect(config).toEqual({ sources: {} });
  });

  it("fails as the config's code failing, with the environment's values masked, when the promise rejects", async () => {
    vi.stubEnv("PROBE_API_KEY", KEY);
    writeConfig(
      "courier.config.mjs",
      `export default new Promise((_, reject) =>
        setTimeout(() => reject(new Error("cannot reach db.invalid with key " + process.env.PROBE_API_KEY)), 20),
      );\n`,
    );

    const failure: unknown = await loadCourierConfigFile(join(dir, "courier.config.mjs")).catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({ name: "ConfigLoadError", code: "EVALUATION_FAILED" });
    expect(String(failure)).toContain("cannot reach db.invalid with key [redacted]");
    expect(JSON.stringify(failure, Object.getOwnPropertyNames(failure))).not.toContain(KEY);
    expect(String((failure as Error).cause)).not.toContain(KEY);
  });

  it("gives the promise no more time than the load", async () => {
    writeConfig("courier.config.mjs", `export default new Promise(() => {});\n`);

    await expect(
      loadCourierConfigFile(join(dir, "courier.config.mjs"), { timeoutMs: 50 }),
    ).rejects.toMatchObject({ code: "LOAD_TIMED_OUT" });
  });
});
