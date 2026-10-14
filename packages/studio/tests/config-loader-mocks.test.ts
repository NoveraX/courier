/**
 * How Studio loads courier.mocks.ts beside courier.config.ts: in one module
 * graph, so every module is evaluated once and the mocks hold the config's
 * very sources, even when either file is a link; a mocks file that does not
 * load leaves the config working and says why, without evaluating it twice;
 * a module that failed while the config loaded fails the mocks file that
 * imports it too; a mocks file whose default export is undefined declares
 * none, as the mock worker reads it; and one that is absent is watched for
 * under every name it may take. A CommonJS mocks file the config imports is
 * Node's to share, so Studio runs it afresh while the config keeps Node's copy.
 */
import { createHash } from "node:crypto";
import {
  chmodSync,
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
import { isRecord } from "@noverax/courier-cli/devkit";
import { loadCourierMocksFile } from "@noverax/courier-studio-core/config";
import { afterEach, assert, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigLoaderError, loadCourierConfig } from "../src/server/config-loader";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");

const API_MODULE =
  'import { defineApi } from "@noverax/courier/define";\n' +
  "const counter = globalThis as { courierTestEvaluations?: number };\n" +
  "counter.courierTestEvaluations = (counter.courierTestEvaluations ?? 0) + 1;\n" +
  'export const api = defineApi({ baseURL: "https://api.example.com", endpoints: {} });\n';

const CONFIG = 'import { api } from "./src/api";\nexport default { sources: { api } };\n';

/** How many times each counted module was evaluated since the test began. */
const evaluations = globalThis as {
  courierTestEvaluations?: number;
  courierTestConfigEvaluations?: number;
  courierTestMocksEvaluations?: number;
};

/** A statement that counts each evaluation of the module it opens under `counter`. */
function counted(counter: "courierTestConfigEvaluations" | "courierTestMocksEvaluations"): string {
  return `const evaluations = globalThis as Record<string, number | undefined>;\nevaluations.${counter} = (evaluations.${counter} ?? 0) + 1;\n`;
}

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-mocks-loader-")));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "api.ts"), API_MODULE);
  writeFileSync(join(dir, "courier.config.ts"), CONFIG);
  delete evaluations.courierTestEvaluations;
  delete evaluations.courierTestConfigEvaluations;
  delete evaluations.courierTestMocksEvaluations;
});

afterEach(() => {
  vi.unstubAllEnvs();
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

function writeMocks(body: string, name = "courier.mocks.ts"): string {
  const file = join(dir, name);
  writeFileSync(file, body);
  return file;
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

describe("loadCourierConfig with a mocks file", () => {
  it("hands the mocks the config's very sources, evaluating each module once", async () => {
    writeMocks('import { api } from "./src/api";\nexport default { apiMock: { source: api } };\n');

    const loaded = await loadCourierConfig(dir);

    const declared = loaded.mocks.entries.apiMock;
    assert(isRecord(declared), "apiMock is not an object");
    expect(declared.source).toBe(loaded.config.sources.api);
    expect(evaluations.courierTestEvaluations).toBe(1);
    expect(loaded.mocks).toMatchObject({ file: join(dir, "courier.mocks.ts"), error: null });
  });

  it("hands the mocks the config's own object when they import it", async () => {
    writeFileSync(
      join(dir, "courier.config.ts"),
      `${counted("courierTestConfigEvaluations")}${CONFIG}`,
    );
    writeMocks(
      'import config from "./courier.config";\nimport { api } from "./src/api";\nexport default { apiMock: { config, source: api } };\n',
    );

    const loaded = await loadCourierConfig(dir);

    const declared = loaded.mocks.entries.apiMock;
    assert(isRecord(declared), "apiMock is not an object");
    expect(declared.config).toBe(loaded.config);
    expect(declared.source).toBe(loaded.config.sources.api);
    expect(evaluations.courierTestConfigEvaluations).toBe(1);
    expect(evaluations.courierTestEvaluations).toBe(1);
  });

  it("evaluates the config once when the mocks file does not load", async () => {
    writeFileSync(
      join(dir, "courier.config.ts"),
      `${counted("courierTestConfigEvaluations")}${CONFIG}`,
    );
    writeMocks('import { missing } from "./src/missing";\nexport default { missing };\n');

    const loaded = await loadCourierConfig(dir);

    expect(Object.keys(loaded.config.sources)).toEqual(["api"]);
    expect(String(loaded.mocks.error)).toContain("src/missing");
    expect(evaluations.courierTestConfigEvaluations).toBe(1);
    expect(evaluations.courierTestEvaluations).toBe(1);
  });

  it("evaluates the config once when it does not load, and never the mocks file", async () => {
    writeFileSync(
      join(dir, "courier.config.ts"),
      `${counted("courierTestConfigEvaluations")}import { api } from "./src/api";\nthrow new Error("the config does not load");\nexport default { sources: { api } };\n`,
    );
    writeMocks(`${counted("courierTestMocksEvaluations")}export default {};\n`);

    const failure = await loadCourierConfig(dir).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConfigLoaderError);
    expect(String(failure)).toContain("the config does not load");
    expect(evaluations.courierTestConfigEvaluations).toBe(1);
    expect(evaluations.courierTestEvaluations).toBe(1);
    expect(evaluations.courierTestMocksEvaluations).toBeUndefined();
  });

  it("evaluates the mocks file once when the config imports it", async () => {
    writeFileSync(
      join(dir, "courier.config.ts"),
      'import { api } from "./src/api";\nimport mocks from "./courier.mocks";\nexport default { sources: { api }, mocks };\n',
    );
    writeMocks(`${counted("courierTestMocksEvaluations")}export default { apiMock: {} };\n`);

    const loaded = await loadCourierConfig(dir);

    expect(loaded.mocks).toMatchObject({ entries: { apiMock: {} }, error: null });
    expect(Reflect.get(loaded.config, "mocks")).toBe(loaded.mocks.entries);
    expect(evaluations.courierTestMocksEvaluations).toBe(1);
  });

  it("runs a courier.mocks.cjs the config imports afresh for Studio, the config keeping Node's copy", async () => {
    writeFileSync(
      join(dir, "courier.config.ts"),
      'import { api } from "./src/api";\nimport mocks from "./courier.mocks.cjs";\nexport default { sources: { api }, mocks };\n',
    );
    const file = writeMocks("module.exports = { before: {} };\n", "courier.mocks.cjs");
    const first = await loadCourierConfig(dir);

    writeFileSync(file, "module.exports = { after: {} };\n");
    const second = await loadCourierConfig(dir);

    expect(first.mocks.entries).toEqual({ before: {} });
    expect(second.mocks.entries).toEqual({ after: {} });
    expect(Reflect.get(second.config, "mocks")).toEqual({ before: {} });
  });

  it("reports a module that failed under the config's catch when the mocks file imports it", async () => {
    writeFileSync(
      join(dir, "src", "flaky.ts"),
      'export const early = 1;\nthrow new Error("flaky does not load");\n',
    );
    writeFileSync(
      join(dir, "courier.config.ts"),
      'import { api } from "./src/api";\ntry {\n  await import("./src/flaky");\n} catch {}\nexport default { sources: { api } };\n',
    );
    writeMocks(
      'import * as flaky from "./src/flaky";\nexport default { flakyMock: { keys: Object.keys(flaky) } };\n',
    );

    const loaded = await loadCourierConfig(dir);

    expect(Object.keys(loaded.config.sources)).toEqual(["api"]);
    expect(loaded.mocks.entries).toEqual({});
    expect(String(loaded.mocks.error)).toContain("flaky does not load");
  });

  it("hands the mocks the config's own object when JITI_TRY_NATIVE asks for native imports first", async () => {
    vi.stubEnv("JITI_TRY_NATIVE", "true");
    writeFileSync(
      join(dir, "courier.config.ts"),
      `${counted("courierTestConfigEvaluations")}export default { sources: { api: { baseURL: "https://api.example.com" } } };\n`,
    );
    writeMocks('import config from "./courier.config";\nexport default { apiMock: { config } };\n');

    const loaded = await loadCourierConfig(dir);

    const declared = loaded.mocks.entries.apiMock;
    assert(isRecord(declared), "apiMock is not an object");
    expect(declared.config).toBe(loaded.config);
    expect(evaluations.courierTestConfigEvaluations).toBe(1);
  });

  it("has no mocks without a mocks file, and watches every name one may take", async () => {
    const loaded = await loadCourierConfig(dir);

    expect(loaded.mocks).toEqual({ file: null, entries: {}, contentHash: null, error: null });
    expect(loaded.deps).toContain(join(dir, "courier.mocks.ts"));
    expect(loaded.deps).toContain(join(dir, "courier.mocks.mjs"));
  });

  it("watches the names that take precedence over the mocks file and the config it loaded", async () => {
    const file = writeMocks("export default {};\n", "courier.mocks.mts");

    const loaded = await loadCourierConfig(dir);

    expect(loaded.mocks.file).toBe(file);
    expect(loaded.deps).toContain(join(dir, "courier.mocks.ts"));
    expect(loaded.deps).toContain(join(dir, "courier.config.mts"));
  });

  it("watches the modules only the mocks file imports", async () => {
    writeFileSync(join(dir, "src", "fixtures.ts"), "export const users = [];\n");
    const file = writeMocks('import { users } from "./src/fixtures";\nexport default { users };\n');

    const loaded = await loadCourierConfig(dir);

    expect(loaded.deps).toContain(file);
    expect(loaded.deps).toContain(join(dir, "src", "fixtures.ts"));
  });

  it("declares no mocks from an empty mocks file", async () => {
    writeMocks("");

    const loaded = await loadCourierConfig(dir);

    expect(loaded.mocks).toMatchObject({ entries: {}, error: null });
  });

  it.each([
    [
      "courier.mocks.ts",
      "const enabled: boolean = false;\nexport default enabled ? { apiMock: {} } : undefined;\n",
    ],
    ["courier.mocks.mjs", "export default undefined;\n"],
    ["courier.mocks.cjs", "module.exports = undefined;\n"],
  ])(
    "declares no mocks from a %s whose default export is undefined, as the mock worker reads it",
    async (name, source) => {
      const file = writeMocks(source, name);

      const loaded = await loadCourierConfig(dir);
      const worker = await loadCourierMocksFile(file);

      expect(loaded.mocks).toMatchObject({ file, error: null });
      expect(loaded.mocks.entries).toStrictEqual({});
      expect(worker.mocks).toStrictEqual({});
    },
  );

  it("says a mocks file with only named exports has no default export, and keeps the config", async () => {
    writeMocks('import { api } from "./src/api";\nexport const apiMock = { source: api };\n');

    const loaded = await loadCourierConfig(dir);

    expect(Object.keys(loaded.config.sources)).toEqual(["api"]);
    expect(loaded.mocks.entries).toEqual({});
    expect(String(loaded.mocks.error)).toContain(
      "has no default export; export default defineMocks({ ... })",
    );
  });

  it("keeps the config working when the mocks file does not load, and says why", async () => {
    writeMocks('import { missing } from "./src/missing";\nexport default { missing };\n');

    const loaded = await loadCourierConfig(dir);

    expect(Object.keys(loaded.config.sources)).toEqual(["api"]);
    expect(loaded.mocks.entries).toEqual({});
    expect(loaded.mocks.error).toBeInstanceOf(Error);
    expect(String(loaded.mocks.error)).toContain("src/missing");
  });

  /* Windows keeps no read permission in a file's mode. */
  it.skipIf(process.getuid?.() === 0 || process.platform === "win32")(
    "keeps the config working when the mocks file cannot be read",
    async () => {
      const file = writeMocks("export default {};\n");
      chmodSync(file, 0o000);

      const loaded = await loadCourierConfig(dir);

      chmodSync(file, 0o644);
      expect(Object.keys(loaded.config.sources)).toEqual(["api"]);
      expect(loaded.mocks).toMatchObject({ file, entries: {}, contentHash: null });
      expect(String(loaded.mocks.error)).toContain("courier.mocks.ts cannot be read");
    },
  );

  it("keeps the config working when a directory takes the mocks file's name", async () => {
    mkdirSync(join(dir, "courier.mocks.ts"));

    const loaded = await loadCourierConfig(dir);

    expect(Object.keys(loaded.config.sources)).toEqual(["api"]);
    expect(String(loaded.mocks.error)).toContain("cannot be read");
  });

  it("fails as a config error when the config itself does not load", async () => {
    writeFileSync(
      join(dir, "courier.config.ts"),
      'import { api } from "./src/nowhere";\nexport default { sources: { api } };\n',
    );
    writeMocks("export default {};\n");

    await expect(loadCourierConfig(dir)).rejects.toBeInstanceOf(ConfigLoaderError);
  });

  it("hashes the bytes it loaded, of the config and of the mocks file", async () => {
    const file = writeMocks("export default {};\n");

    const loaded = await loadCourierConfig(dir);

    expect(loaded.contentHash).toBe(sha256(join(dir, "courier.config.ts")));
    expect(loaded.mocks.contentHash).toBe(sha256(file));
  });
});

describe("finding the mocks file", () => {
  it("looks beside the config Studio was pointed at, not where a linked config really lives", async () => {
    mkdirSync(join(dir, "shared"));
    writeFileSync(
      join(dir, "shared", "courier.config.ts"),
      'import { api } from "../src/api";\nexport default { sources: { api } };\n',
    );
    writeFileSync(join(dir, "shared", "courier.mocks.ts"), "export default { elsewhere: {} };\n");
    rmSync(join(dir, "courier.config.ts"));
    symlinkSync(join(dir, "shared", "courier.config.ts"), join(dir, "courier.config.ts"));
    const here = writeMocks("export default { here: {} };\n");

    const loaded = await loadCourierConfig(dir);

    expect(Object.keys(loaded.mocks.entries)).toEqual(["here"]);
    expect(loaded.mocks.file).toBe(here);
    expect(loaded.mocks.contentHash).toBe(sha256(here));
  });

  it("loads a mocks file that is a link, by the file it points to", async () => {
    mkdirSync(join(dir, "shared"));
    writeFileSync(join(dir, "shared", "mocks.ts"), "export default { linked: {} };\n");
    symlinkSync(join(dir, "shared", "mocks.ts"), join(dir, "courier.mocks.ts"));

    const loaded = await loadCourierConfig(dir);

    expect(loaded.mocks).toMatchObject({ file: join(dir, "shared", "mocks.ts"), error: null });
    expect(Object.keys(loaded.mocks.entries)).toEqual(["linked"]);
  });

  it("reports a link to a mocks file that is gone, rather than taking it for none", async () => {
    symlinkSync(join(dir, "shared", "gone.ts"), join(dir, "courier.mocks.ts"));

    const loaded = await loadCourierConfig(dir);

    expect(Object.keys(loaded.config.sources)).toEqual(["api"]);
    expect(String(loaded.mocks.error)).toContain("is a link to a file that does not exist");
  });

  it("evaluates a linked config once, and hands the mocks that very object", async () => {
    mkdirSync(join(dir, "shared"));
    writeFileSync(
      join(dir, "shared", "courier.config.ts"),
      `${counted("courierTestConfigEvaluations")}import { api } from "../src/api";\nexport default { sources: { api } };\n`,
    );
    rmSync(join(dir, "courier.config.ts"));
    symlinkSync(join(dir, "shared", "courier.config.ts"), join(dir, "courier.config.ts"));
    writeMocks('import config from "./courier.config";\nexport default { apiMock: { config } };\n');

    const loaded = await loadCourierConfig(dir);

    const declared = loaded.mocks.entries.apiMock;
    assert(isRecord(declared), "apiMock is not an object");
    expect(declared.config).toBe(loaded.config);
    expect(evaluations.courierTestConfigEvaluations).toBe(1);
    expect(loaded.mocks.error).toBeNull();
  });

  it("resolves the mocks file's path aliases from its own directory when the config is a link", async () => {
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { paths: { "@fixtures/*": ["./fixtures/*"] } } }),
    );
    mkdirSync(join(dir, "fixtures"));
    writeFileSync(join(dir, "fixtures", "users.ts"), "export const users = [{ id: 1 }];\n");
    mkdirSync(join(dir, "shared"));
    writeFileSync(
      join(dir, "shared", "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true } }),
    );
    writeFileSync(
      join(dir, "shared", "courier.config.ts"),
      'import { api } from "../src/api";\nexport default { sources: { api } };\n',
    );
    rmSync(join(dir, "courier.config.ts"));
    symlinkSync(join(dir, "shared", "courier.config.ts"), join(dir, "courier.config.ts"));
    writeMocks(
      'import { users } from "@fixtures/users";\nexport default { apiMock: { users } };\n',
    );

    const loaded = await loadCourierConfig(dir);

    expect(loaded.mocks.error).toBeNull();
    expect(loaded.mocks.entries).toEqual({ apiMock: { users: [{ id: 1 }] } });
    expect(loaded.deps).toContain(join(dir, "fixtures", "users.ts"));
  });

  it("loads a linked mocks file whose target imports a module beside it", async () => {
    mkdirSync(join(dir, "mocks"));
    writeFileSync(join(dir, "mocks", "handlers.ts"), "export const handlers = { users: [] };\n");
    writeFileSync(
      join(dir, "mocks", "index.ts"),
      'import { handlers } from "./handlers";\nexport default { linked: handlers };\n',
    );
    symlinkSync(join(dir, "mocks", "index.ts"), join(dir, "courier.mocks.ts"));

    const loaded = await loadCourierConfig(dir);

    expect(loaded.mocks).toMatchObject({ file: join(dir, "mocks", "index.ts"), error: null });
    expect(loaded.mocks.entries).toEqual({ linked: { users: [] } });
    expect(loaded.deps).toContain(join(dir, "mocks", "handlers.ts"));
  });

  it("takes courier.mocks.ts before the other names", async () => {
    writeMocks("export default { fromMjs: {} };\n", "courier.mocks.mjs");
    writeMocks("export default { fromTs: {} };\n");

    const loaded = await loadCourierConfig(dir);

    expect(Object.keys(loaded.mocks.entries)).toEqual(["fromTs"]);
  });
});
