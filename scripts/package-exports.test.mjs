/**
 * What a consumer can resolve from each published package, through its
 * `exports` map as Node applies it.
 *
 * Only two packages listed their own `package.json` there, so a tool that
 * reads a package's version or metadata with
 * `require.resolve("<name>/package.json")` failed on the rest with
 * ERR_PACKAGE_PATH_NOT_EXPORTED.
 */
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { packageDirs, readPkg } from "./release-order.ts";

const require = createRequire(import.meta.url);

const PUBLISHED = packageDirs().map((dir) => [readPkg(dir).name, dir]);

describe("every published package", () => {
  it.each(PUBLISHED)("%s exports its package.json", (name, dir) => {
    const manifest = require.resolve(`${name}/package.json`);

    expect(realpathSync(manifest)).toBe(realpathSync(resolve(dir, "package.json")));
  });
});
