import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTransformCache } from "@noverax/courier-studio-core/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createModuleCache } from "../src/server/create-module-cache";
import { loadCourierEntry } from "../src/server/load-courier-entry";

let dir: string;
let file: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-module-cache-")));
  file = join(dir, "courier.config.ts");
  writeFileSync(file, "export default { sources: {} };\n");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("createModuleCache", () => {
  it("keeps a module a load evaluated under one name, found by any name of its file", async () => {
    const cache = createModuleCache();

    await loadCourierEntry(file, cache, createTransformCache());

    const another = `${dir}/./courier.config.ts`;
    expect(Object.keys(cache)).toEqual([file]);
    expect(cache[file]?.loaded).toBe(true);
    expect(cache[another]).toBe(cache[file]);
    expect(another in cache).toBe(true);
    Reflect.deleteProperty(cache, another);
    expect(Object.keys(cache)).toEqual([]);
  });

  it.runIf(process.platform === "win32")(
    "finds a module by the name with forward slashes the loader gives a file it resolves itself",
    async () => {
      const cache = createModuleCache();

      await loadCourierEntry(file, cache, createTransformCache());

      expect(cache[file.replaceAll("\\", "/")]).toBe(cache[file]);
    },
  );
});
