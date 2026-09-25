import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";
import { getSourceName } from "@noverax/courier/define";
import {
  ConfigLoaderError,
  ConfigNotFoundError,
  loadCourierConfig,
} from "../src/server/config-loader";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-config-loader-"));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
});

afterEach(() => {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

function writeConfig(body: string): void {
  writeFileSync(join(dir, "courier.config.ts"), body, "utf-8");
}

describe("loadCourierConfig", () => {
  it("throws ConfigNotFoundError when no config file exists", async () => {
    await expect(loadCourierConfig(dir)).rejects.toBeInstanceOf(ConfigNotFoundError);
  });

  it("loads a minimal config and returns deps including the config file", async () => {
    writeConfig(`
      import { defineApi } from "@noverax/courier/define";
      export default {
        sources: {
          stripe: defineApi({ baseURL: "https://api.example.com", endpoints: {} }),
        },
      };
    `);
    const result = await loadCourierConfig(dir);
    expect(Object.keys(result.config.sources)).toEqual(["stripe"]);
    expect(result.deps[0]).toBe(result.configFile);
  });

  it("stamps the config key as canonical source name (overrides auto-derived name)", async () => {
    writeConfig(`
      import { defineApi } from "@noverax/courier/define";
      export default {
        sources: {
          payments: defineApi({ baseURL: "https://api.example.com", endpoints: {} }),
        },
      };
    `);
    const result = await loadCourierConfig(dir);
    expect(getSourceName(result.config.sources.payments)).toBe("payments");
  });

  it("throws CONFIG_SOURCE_KEY_MISMATCH when explicit defineApi name conflicts with key", async () => {
    writeConfig(`
      import { defineApi } from "@noverax/courier/define";
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
    await expect(loadCourierConfig(dir)).rejects.toMatchObject({
      code: "CONFIG_SOURCE_KEY_MISMATCH",
    });
  });

  it("throws CONFIG_INVALID when sources is missing", async () => {
    writeConfig(`export default {};`);
    await expect(loadCourierConfig(dir)).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });

  it("throws CONFIG_INVALID when sources is empty", async () => {
    writeConfig(`export default { sources: {} };`);
    await expect(loadCourierConfig(dir)).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });

  it("throws CONFIG_INVALID naming a source that a misspelled import leaves undefined", async () => {
    writeFileSync(join(dir, "api.ts"), "export const api = { options: { baseURL: \"https://api.example\" } };\n");
    writeConfig(`import { apii } from "./api";\nexport default { sources: { api: apii } };\n`);

    await expect(loadCourierConfig(dir)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining("courier.config.sources.api is undefined, not a source"),
    });
  });

  it("throws CONFIG_INVALID for a source that is neither an object nor undefined", async () => {
    writeConfig(`export default { sources: { api: "https://api.example", other: null } };`);

    await expect(loadCourierConfig(dir)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining("courier.config.sources.api is a string, not a source"),
    });
  });

  it("ConfigLoaderError carries cwd context for missing files", async () => {
    try {
      await loadCourierConfig(dir);
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigLoaderError);
      expect((err as ConfigLoaderError).context?.cwd).toBe(dir);
    }
  });
});

describe("loadCourierConfig — what it read", () => {
  const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
  let root: string;

  beforeEach(() => {
    root = realpathSync(dir);
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "api.ts"), 'export const api = { baseURL: "https://api.example.com" };\n');
  });

  it("returns every file it depends on with the hash of the bytes it read, and null for each absent name", async () => {
    writeConfig('import { api } from "./src/api";\nexport default { sources: { api } };\n');

    const loaded = await loadCourierConfig(root);

    const config = join(root, "courier.config.ts");
    expect(loaded.depHashes.get(config)).toBe(sha256(config));
    expect(loaded.depHashes.get(join(root, "src", "api.ts"))).toBe(sha256(join(root, "src", "api.ts")));
    expect(loaded.depHashes.get(join(root, "courier.mocks.ts"))).toBeNull();
    expect(loaded.depHashes.get(join(root, "courier.config.mts"))).toBeNull();
    expect([...loaded.depHashes.keys()]).toEqual(loaded.deps);
  });

  it("hands over what it read before it evaluates anything", async () => {
    const counter = globalThis as { courierTestReadFirst?: number };
    delete counter.courierTestReadFirst;
    writeConfig(
      'import { api } from "./src/api";\n(globalThis as { courierTestReadFirst?: number }).courierTestReadFirst = 1;\nexport default { sources: { api } };\n',
    );
    const seen: Array<number | undefined> = [];

    await loadCourierConfig(root, {
      onInputs: (inputs) => {
        expect(inputs.has(join(root, "src", "api.ts"))).toBe(true);
        seen.push(counter.courierTestReadFirst);
      },
    });

    expect(seen).toEqual([undefined]);
    expect(counter.courierTestReadFirst).toBe(1);
  });

  it("a load that fails carries every file it read, the module that threw included", async () => {
    const broken = join(root, "src", "broken.ts");
    writeFileSync(broken, 'throw new Error("broken module");\n');
    writeConfig('import "./src/broken";\nimport { api } from "./src/api";\nexport default { sources: { api } };\n');

    const error = await loadCourierConfig(root).catch((err: unknown) => err);

    assert(error instanceof ConfigLoaderError, "the load did not fail with a ConfigLoaderError");
    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.depHashes?.get(broken)).toBe(sha256(broken));
    expect(error.depHashes?.get(join(root, "courier.mocks.ts"))).toBeNull();
  });

  it("a config that exports no sources carries every file it read too", async () => {
    writeConfig('import { api } from "./src/api";\nexport default { api };\n');

    const error = await loadCourierConfig(root).catch((err: unknown) => err);

    assert(error instanceof ConfigLoaderError, "the load did not fail with a ConfigLoaderError");
    expect(error.depHashes?.get(join(root, "src", "api.ts"))).toBe(sha256(join(root, "src", "api.ts")));
  });
});
