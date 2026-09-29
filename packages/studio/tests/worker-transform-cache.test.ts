/**
 * The transform cache a mock worker loads its mocks file through: it reads
 * what Studio kept, adds nothing to Studio's directory, and holds nothing in
 * memory past a transform.
 */
import { mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTransformCache, type TransformCache } from "@noverax/courier-studio-core/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { workerTransformCache } from "../src/server/mock-manager/worker-transform-cache";

type TransformOptions = Parameters<TransformCache["transform"]>[0];

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function transformDirectory(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "courier-worker-cache-")));
  directories.push(directory);
  return directory;
}

function optionsFor(filename: string): TransformOptions {
  return { filename, source: "export default { apiMock: {} };", ts: true, async: true };
}

function compiler() {
  return vi.fn((options: TransformOptions) => ({ code: `compiled:${options.source}` }));
}

describe("workerTransformCache", () => {
  it("transforms a module again each time it is asked, keeping nothing in memory", () => {
    const cache = workerTransformCache(null);
    const compute = compiler();

    cache.transform(optionsFor("/app/courier.mocks.ts"), compute);
    cache.transform(optionsFor("/app/courier.mocks.ts"), compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("hands back what Studio kept in the directory without transforming it", () => {
    const directory = transformDirectory();
    const options = optionsFor("/app/courier.mocks.ts");
    createTransformCache({ directory }).transform(options, () => ({ code: "kept by Studio" }));
    const compute = compiler();

    const result = workerTransformCache(directory).transform(options, compute);

    expect(result).toEqual({ code: "kept by Studio" });
    expect(compute).not.toHaveBeenCalled();
  });

  it("adds nothing to the directory for a module Studio did not keep", () => {
    const directory = transformDirectory();
    createTransformCache({ directory }).transform(optionsFor("/app/courier.mocks.ts"), () => ({
      code: "kept",
    }));
    const before = readdirSync(directory).sort();
    const compute = compiler();

    workerTransformCache(directory).transform(optionsFor("/app/src/api.ts"), compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(readdirSync(directory).sort()).toEqual(before);
  });
});
