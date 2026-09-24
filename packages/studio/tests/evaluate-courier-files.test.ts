/**
 * How the config and the mocks file are evaluated over one module cache: the
 * config under the key its importers resolve it to, however its path is
 * spelled, and its default export settled when it is a promise, as the
 * runtime's loader settles it; a module the config left still evaluating is
 * evaluated again for the mocks file; and Node's require cache is left as
 * the load found it for the files it required.
 */
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { createTransformCache } from "@noverax/courier-studio-core/config";
import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";
import { evaluateCourierFiles } from "../src/server/evaluate-courier-files";
import { isRecord } from "../src/server/mocks-edit/is-record";

const CONFIG = 'export default { sources: { api: { baseURL: "https://api.example.com" } } };\n';

/** How many times each counted module was evaluated since the test began. */
const evaluations = globalThis as {
  courierTestConfigEvaluations?: number;
  courierTestPendingEvaluations?: number;
};

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-evaluate-files-")));
  delete evaluations.courierTestConfigEvaluations;
  delete evaluations.courierTestPendingEvaluations;
});

/** Node's require cache, which a CommonJS config is required into. */
const NODE_REQUIRE_CACHE = createRequire(import.meta.url).cache;

afterEach(() => {
  for (const file of Object.keys(NODE_REQUIRE_CACHE)) {
    if (file.startsWith(dir)) Reflect.deleteProperty(NODE_REQUIRE_CACHE, file);
  }
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

/** The default export of an evaluated mocks namespace. */
function mocksDefaultOf(namespace: unknown): Record<string, unknown> {
  assert(isRecord(namespace), "the mocks namespace is not an object");
  const declared = namespace.default;
  assert(isRecord(declared), "the mocks file's default export is not an object");
  return declared;
}

describe("evaluateCourierFiles", () => {
  it("evaluates the config once and hands the mocks that object, however its path is spelled", async () => {
    writeFileSync(
      join(dir, "courier.config.ts"),
      "const evaluations = globalThis as Record<string, number | undefined>;\n" +
        "evaluations.courierTestConfigEvaluations = (evaluations.courierTestConfigEvaluations ?? 0) + 1;\n" +
        CONFIG,
    );
    writeFileSync(join(dir, "courier.mocks.ts"), 'import config from "./courier.config";\nexport default { config };\n');
    const spelledOtherwise = `${dir}${sep}.${sep}courier.config.ts`;

    const evaluated = await evaluateCourierFiles(
      spelledOtherwise,
      join(dir, "courier.mocks.ts"),
      createTransformCache(),
    );

    expect(mocksDefaultOf(evaluated.mocksNamespace).config).toBe(evaluated.config);
    expect(evaluations.courierTestConfigEvaluations).toBe(1);
  });

  it("evaluates again for the mocks file a module the config left at its top-level await", async () => {
    writeFileSync(
      join(dir, "pending.ts"),
      "const evaluations = globalThis as Record<string, number | undefined>;\n" +
        "evaluations.courierTestPendingEvaluations = (evaluations.courierTestPendingEvaluations ?? 0) + 1;\n" +
        "await new Promise((resolve) => setTimeout(resolve, 50));\n" +
        "export const db = {};\n",
    );
    writeFileSync(
      join(dir, "courier.config.ts"),
      'const pending = import("./pending");\n' +
        'export default { sources: { api: { baseURL: "https://api.example.com" } }, pending };\n',
    );
    writeFileSync(join(dir, "courier.mocks.ts"), 'import { db } from "./pending";\nexport default { db };\n');

    const evaluated = await evaluateCourierFiles(
      join(dir, "courier.config.ts"),
      join(dir, "courier.mocks.ts"),
      createTransformCache(),
    );

    assert(isRecord(evaluated.config), "the config is not an object");
    const configs: unknown = await evaluated.config.pending;
    assert(isRecord(configs), "the config's pending module is not an object");
    expect(mocksDefaultOf(evaluated.mocksNamespace).db).not.toBe(configs.db);
    expect(evaluations.courierTestPendingEvaluations).toBe(2);
  });

  it("leaves no module of a courier.config.cjs in Node's require cache once the load is over", async () => {
    const file = join(dir, "courier.config.cjs");
    writeFileSync(file, `module.exports = ${CONFIG.slice("export default ".length)}`);
    writeFileSync(join(dir, "courier.mocks.cjs"), 'module.exports = { config: require("./courier.config.cjs") };\n');

    const evaluated = await evaluateCourierFiles(file, join(dir, "courier.mocks.cjs"), createTransformCache());

    expect(mocksDefaultOf(evaluated.mocksNamespace).config).toBe(evaluated.config);
    expect(NODE_REQUIRE_CACHE[file]).toBeUndefined();
    expect(NODE_REQUIRE_CACHE[join(dir, "courier.mocks.cjs")]).toBeUndefined();
  });

  it("puts back the module Node's require cache held for a courier.config.cjs before the load", async () => {
    const file = join(dir, "courier.config.cjs");
    writeFileSync(file, `module.exports = ${CONFIG.slice("export default ".length)}`);
    const held: unknown = createRequire(file)(file);
    const module = NODE_REQUIRE_CACHE[file];

    const evaluated = await evaluateCourierFiles(file, null, createTransformCache());

    expect(evaluated.config).not.toBe(held);
    expect(NODE_REQUIRE_CACHE[file]).toBe(module);
  });

  it.each([
    { label: "alone", mocks: null },
    { label: "beside a mocks file", mocks: "export default {};\n" },
  ])("settles a config whose default export is a promise, $label", async ({ mocks }) => {
    writeFileSync(
      join(dir, "courier.config.ts"),
      'export default Promise.resolve({ sources: { api: { baseURL: "https://api.example.com" } } });\n',
    );
    if (mocks !== null) writeFileSync(join(dir, "courier.mocks.ts"), mocks);

    const evaluated = await evaluateCourierFiles(
      join(dir, "courier.config.ts"),
      mocks === null ? null : join(dir, "courier.mocks.ts"),
      createTransformCache(),
    );

    expect(evaluated).toMatchObject({
      config: { sources: { api: { baseURL: "https://api.example.com" } } },
      mocksError: null,
    });
  });
});
