/**
 * How one courier.config or courier.mocks file is evaluated into the module
 * cache a load shares: a CommonJS file required by Node, afresh, with its
 * module.exports as its default, and transpiled when Node cannot run it; any
 * other file transpiled; and a file the cache already holds, loaded, not
 * evaluated again.
 */
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTransformCache } from "@noverax/courier-studio-core/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CourierModuleCache, loadCourierEntry } from "../src/server/load-courier-entry";

/** How many times the counted file was evaluated since the test began. */
const evaluations = globalThis as { courierTestEntryEvaluations?: number };

const COUNTED =
  "const evaluations = globalThis as Record<string, number | undefined>;\n" +
  "evaluations.courierTestEntryEvaluations = (evaluations.courierTestEntryEvaluations ?? 0) + 1;\n";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-load-entry-")));
  delete evaluations.courierTestEntryEvaluations;
});

afterEach(() => {
  const nodeRequireCache = createRequire(import.meta.url).cache;
  for (const file of Object.keys(nodeRequireCache)) {
    if (file.startsWith(dir)) Reflect.deleteProperty(nodeRequireCache, file);
  }
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

describe("loadCourierEntry", () => {
  it("hands a CommonJS file's module.exports as its default, run afresh on every load", async () => {
    const file = join(dir, "courier.mocks.cjs");
    writeFileSync(file, "module.exports = { first: {} };\n");
    const first = await loadCourierEntry(file, {}, createTransformCache());

    writeFileSync(file, "module.exports = { second: {} };\n");
    const second = await loadCourierEntry(file, {}, createTransformCache());

    expect(first).toEqual({ default: { first: {} } });
    expect(second).toEqual({ default: { second: {} } });
  });

  it("hands the load's cache the module Node's require cache holds for a CommonJS file", async () => {
    const file = join(dir, "courier.mocks.cjs");
    writeFileSync(file, "module.exports = { apiMock: {} };\n");
    const cache: CourierModuleCache = {};

    const namespace = await loadCourierEntry(file, cache, createTransformCache());

    expect(cache[file]).toMatchObject({ loaded: true, exports: { apiMock: {} } });
    expect(cache[file]).toBe(createRequire(file).cache[file]);
    expect(namespace).toEqual({ default: cache[file]?.exports });
  });

  it("transpiles a CommonJS file Node cannot run, as the runtime's loader does", async () => {
    const file = join(dir, "courier.mocks.cjs");
    writeFileSync(file, "export default { apiMock: {} };\n");
    const cache: CourierModuleCache = {};

    const namespace = await loadCourierEntry(file, cache, createTransformCache());

    expect(namespace).toMatchObject({ default: { apiMock: {} } });
    expect(cache[file]).toMatchObject({ loaded: true });
  });

  it("does not evaluate again a file the cache already holds, loaded", async () => {
    const file = join(dir, "courier.mocks.ts");
    writeFileSync(file, `${COUNTED}export default { apiMock: {} };\n`);
    const cache: CourierModuleCache = {};
    const transformCache = createTransformCache();

    const first = await loadCourierEntry(file, cache, transformCache);
    const second = await loadCourierEntry(file, cache, transformCache);

    expect(second).toBe(first);
    expect(evaluations.courierTestEntryEvaluations).toBe(1);
  });

  it("evaluates a file again for a load of its own", async () => {
    const file = join(dir, "courier.mocks.ts");
    writeFileSync(file, `${COUNTED}export default { apiMock: {} };\n`);
    const transformCache = createTransformCache();

    await loadCourierEntry(file, {}, transformCache);
    await loadCourierEntry(file, {}, transformCache);

    expect(evaluations.courierTestEntryEvaluations).toBe(2);
  });
});
