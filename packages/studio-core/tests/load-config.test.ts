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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCourierConfig } from "../src/runtime/load-config";

/**
 * The loader delegates to c12, which uses jiti to transpile TS configs.
 * jiti resolves bare imports against the nearest `node_modules`, so tests
 * that write `defineApi(...)` inside the config need a symlinked node_modules
 * pointing at the repo root (same pattern as studio's own config-loader test).
 * Simple fixtures without bare imports don't need the symlink.
 */
const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");

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
    // This test exercises the full jiti/c12 pipeline including node_modules
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
