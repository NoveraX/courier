import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSourceName } from "@noverax/nexus/define";
import {
  ConfigLoaderError,
  ConfigNotFoundError,
  loadNexusConfig,
} from "../src/server/config-loader";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nexus-config-loader-"));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
});

afterEach(() => {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

function writeConfig(body: string): void {
  writeFileSync(join(dir, "nexus.config.ts"), body, "utf-8");
}

describe("loadNexusConfig", () => {
  it("throws ConfigNotFoundError when no config file exists", async () => {
    await expect(loadNexusConfig(dir)).rejects.toBeInstanceOf(ConfigNotFoundError);
  });

  it("loads a minimal config and returns deps including the config file", async () => {
    writeConfig(`
      import { defineApi } from "@noverax/nexus/define";
      export default {
        sources: {
          stripe: defineApi({ baseURL: "https://api.example.com", endpoints: {} }),
        },
      };
    `);
    const result = await loadNexusConfig(dir);
    expect(Object.keys(result.config.sources)).toEqual(["stripe"]);
    expect(result.deps[0]).toBe(result.configFile);
  });

  it("stamps the config key as canonical source name (overrides auto-derived name)", async () => {
    writeConfig(`
      import { defineApi } from "@noverax/nexus/define";
      export default {
        sources: {
          payments: defineApi({ baseURL: "https://api.example.com", endpoints: {} }),
        },
      };
    `);
    const result = await loadNexusConfig(dir);
    expect(getSourceName(result.config.sources.payments)).toBe("payments");
  });

  it("throws CONFIG_SOURCE_KEY_MISMATCH when explicit defineApi name conflicts with key", async () => {
    writeConfig(`
      import { defineApi } from "@noverax/nexus/define";
      export default {
        sources: {
          payments: defineApi({
            name: "stripe-prod",
            baseURL: "https://internal.example.com",
            endpoints: {},
          }),
        },
      };
    `);
    await expect(loadNexusConfig(dir)).rejects.toMatchObject({
      code: "CONFIG_SOURCE_KEY_MISMATCH",
    });
  });

  it("throws CONFIG_INVALID when sources is missing", async () => {
    writeConfig(`export default {};`);
    await expect(loadNexusConfig(dir)).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });

  it("throws CONFIG_INVALID when sources is empty", async () => {
    writeConfig(`export default { sources: {} };`);
    await expect(loadNexusConfig(dir)).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });

  it("ConfigLoaderError carries cwd context for missing files", async () => {
    try {
      await loadNexusConfig(dir);
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigLoaderError);
      expect((err as ConfigLoaderError).context?.cwd).toBe(dir);
    }
  });
});
