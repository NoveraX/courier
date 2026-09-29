import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfigJiti } from "@noverax/courier-studio-core/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOADER_EXTENSIONS, loaderCandidates } from "../src/server/loader-candidates";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-loader-candidates-")));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loaderCandidates", () => {
  it("tries the extensions the module loader is created with, in its order", async () => {
    const jiti = await createConfigJiti(join(dir, "courier.config.ts"));

    expect(LOADER_EXTENSIONS).toEqual(jiti.options.extensions);
  });

  it("lists the path, then the path with each extension, then its index files", () => {
    const base = join(dir, "api");

    const { candidates } = loaderCandidates(base);

    expect(candidates).toEqual([
      base,
      ...LOADER_EXTENSIONS.map((extension) => `${base}${extension}`),
      ...LOADER_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
    ]);
  });

  it("falls back on the path with each extension but .js, each followed by its index file", () => {
    const base = join(dir, "api");

    const { fallbacks } = loaderCandidates(base);

    expect(fallbacks).toEqual(
      LOADER_EXTENSIONS.slice(1).flatMap((extension) => [
        `${base}${extension}`,
        join(base, `index${extension}`),
      ]),
    );
  });

  it("falls back on the TypeScript twin of a JavaScript extension after the first two", () => {
    const base = join(dir, "api.js");

    const { fallbacks } = loaderCandidates(base);

    expect(fallbacks.slice(0, 3)).toEqual([
      `${base}.mjs`,
      join(base, "index.mjs"),
      join(dir, "api.ts"),
    ]);
    expect(fallbacks.filter((path) => !path.startsWith(base))).toEqual([join(dir, "api.ts")]);
  });

  it("names the TypeScript twin of each JavaScript extension", () => {
    const twins = [".js", ".jsx", ".mjs", ".cjs", ".mjsx", ".cjsx"].map(
      (extension) => loaderCandidates(join(dir, `api${extension}`)).fallbacks[2],
    );

    expect(twins).toEqual(
      [".ts", ".tsx", ".mts", ".cts", ".mtsx", ".ctsx"].map((extension) =>
        join(dir, `api${extension}`),
      ),
    );
  });
});
