/**
 * How Studio loads courier.mocks.ts beside courier.config.ts: in one module
 * graph, so every module is evaluated once and the mocks hold the config's
 * very sources; a mocks file that does not load leaves the config working and
 * says why; and one that is absent is watched for under every name it may take.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigLoaderError, loadCourierConfig } from "../src/server/config-loader";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../node_modules");

const API_MODULE =
  'import { defineApi } from "@noverax/courier/define";\n' +
  "const counter = globalThis as { courierTestEvaluations?: number };\n" +
  "counter.courierTestEvaluations = (counter.courierTestEvaluations ?? 0) + 1;\n" +
  'export const api = defineApi({ baseURL: "https://api.example.com", endpoints: {} });\n';

const CONFIG = 'import { api } from "./src/api";\nexport default { sources: { api } };\n';

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-mocks-loader-")));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "api.ts"), API_MODULE);
  writeFileSync(join(dir, "courier.config.ts"), CONFIG);
  delete (globalThis as { courierTestEvaluations?: number }).courierTestEvaluations;
});

afterEach(() => {
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

    const declared = loaded.mocks.entries.apiMock as { source: unknown };
    expect(declared.source).toBe(loaded.config.sources.api);
    expect((globalThis as { courierTestEvaluations?: number }).courierTestEvaluations).toBe(1);
    expect(loaded.mocks).toMatchObject({ file: join(dir, "courier.mocks.ts"), error: null });
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

  it("says a mocks file with only named exports has no default export, and keeps the config", async () => {
    writeMocks('import { api } from "./src/api";\nexport const apiMock = { source: api };\n');

    const loaded = await loadCourierConfig(dir);

    expect(Object.keys(loaded.config.sources)).toEqual(["api"]);
    expect(loaded.mocks.entries).toEqual({});
    expect(String(loaded.mocks.error)).toContain("has no default export; export default defineMocks({ ... })");
  });

  it("keeps the config working when the mocks file does not load, and says why", async () => {
    writeMocks('import { missing } from "./src/missing";\nexport default { missing };\n');

    const loaded = await loadCourierConfig(dir);

    expect(Object.keys(loaded.config.sources)).toEqual(["api"]);
    expect(loaded.mocks.entries).toEqual({});
    expect(loaded.mocks.error).toBeInstanceOf(Error);
    expect(String(loaded.mocks.error)).toContain("src/missing");
  });

  it("fails as a config error when the config itself does not load", async () => {
    writeFileSync(join(dir, "courier.config.ts"), 'import { api } from "./src/nowhere";\nexport default { sources: { api } };\n');
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
    writeFileSync(join(dir, "shared", "courier.config.ts"), 'import { api } from "../src/api";\nexport default { sources: { api } };\n');
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

  it("takes courier.mocks.ts before the other names", async () => {
    writeMocks("export default { fromMjs: {} };\n", "courier.mocks.mjs");
    writeMocks("export default { fromTs: {} };\n");

    const loaded = await loadCourierConfig(dir);

    expect(Object.keys(loaded.mocks.entries)).toEqual(["fromTs"]);
  });
});
