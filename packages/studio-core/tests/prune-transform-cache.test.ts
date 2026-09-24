/**
 * @vitest-environment node
 */
import {
  existsSync,
  lutimesSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TransformOptions, TransformResult } from "jiti";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pruneTransformCache } from "../src/runtime/prune-transform-cache";
import { createTransformCache } from "../src/runtime/transform-cache";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const ENTRY_TEXT = "// courier-transform 2 digest 0 sha\n";

let dir: string;
let directory: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-transform-prune-")));
  directory = join(dir, "transform");
  mkdirSync(directory, { mode: 0o700 });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

/** Write a file into the directory, last modified `ageMs` ago. */
function place(name: string, contents: string, ageMs: number): void {
  const path = join(directory, name);
  writeFileSync(path, contents);
  const modified = new Date(Date.now() - ageMs);
  utimesSync(path, modified, modified);
}

function listing(): string[] {
  return readdirSync(directory).sort();
}

function transformOnce(cache = createTransformCache({ directory }), filename = "/project/courier.config.ts"): void {
  const options: TransformOptions = { filename, source: "export default {};", async: true };
  cache.transform(options, (miss): TransformResult => ({ code: `compiled:${miss.source}` }));
}

describe("pruning at the first write", () => {
  it("deletes entries older than 30 days and temporary files older than an hour, and leaves fresh ones", () => {
    place(`${"a".repeat(40)}.js`, ENTRY_TEXT, 31 * DAY_MS);
    place(`${"b".repeat(40)}.js`, ENTRY_TEXT, 29 * DAY_MS);
    place(`${"c".repeat(40)}.js.101.0a1b2c3d4e5f.tmp`, "partial", 2 * HOUR_MS);
    place(`${"d".repeat(40)}.js.102.0a1b2c3d4e5f.tmp`, "partial", 30 * MINUTE_MS);

    transformOnce();

    const kept = listing();
    expect(kept).not.toContain(`${"a".repeat(40)}.js`);
    expect(kept).not.toContain(`${"c".repeat(40)}.js.101.0a1b2c3d4e5f.tmp`);
    expect(kept).toContain(`${"b".repeat(40)}.js`);
    expect(kept).toContain(`${"d".repeat(40)}.js.102.0a1b2c3d4e5f.tmp`);
    expect(kept).toHaveLength(3);
  });

  it("leaves an old .js file that does not start like an entry, and any other old file", () => {
    place("notes.js", "console.log('mine');\n", 60 * DAY_MS);
    place("README", "mine\n", 60 * DAY_MS);

    transformOnce();

    expect(listing()).toEqual(expect.arrayContaining(["README", "notes.js"]));
    expect(listing()).toHaveLength(3);
  });

  it("prunes at the first write, not at every write", () => {
    const cache = createTransformCache({ directory });
    transformOnce(cache);
    place(`${"e".repeat(40)}.js`, ENTRY_TEXT, 31 * DAY_MS);

    transformOnce(cache, "/project/sources.ts");

    expect(listing()).toContain(`${"e".repeat(40)}.js`);
  });

  it("prunes a directory once per process, however many caches write to it", () => {
    transformOnce();
    place(`${"i".repeat(40)}.js`, ENTRY_TEXT, 31 * DAY_MS);

    transformOnce(createTransformCache({ directory }), "/project/sources.ts");

    expect(listing()).toContain(`${"i".repeat(40)}.js`);
  });
});

describe("pruneTransformCache", () => {
  it.skipIf(process.platform === "win32")(
    "never follows a link, nor enters a subdirectory, whatever their age",
    () => {
      const outside = join(dir, "outside.js");
      writeFileSync(outside, ENTRY_TEXT);
      const old = new Date(Date.now() - 60 * DAY_MS);
      utimesSync(outside, old, old);
      symlinkSync(outside, join(directory, `${"f".repeat(40)}.js`));
      lutimesSync(join(directory, `${"f".repeat(40)}.js`), old, old);
      mkdirSync(join(directory, "nested"));
      writeFileSync(join(directory, "nested", `${"g".repeat(40)}.js`), ENTRY_TEXT);
      utimesSync(join(directory, "nested", `${"g".repeat(40)}.js`), old, old);

      pruneTransformCache(directory);

      expect(existsSync(outside)).toBe(true);
      expect(listing()).toEqual([`${"f".repeat(40)}.js`, "nested"]);
      expect(readdirSync(join(directory, "nested"))).toEqual([`${"g".repeat(40)}.js`]);
    },
  );

  it("measures age against the time it is given", () => {
    place(`${"h".repeat(40)}.js`, ENTRY_TEXT, 0);

    pruneTransformCache(directory, Date.now() + 31 * DAY_MS);

    expect(listing()).toEqual([]);
  });

  it("logs at debug level, and goes on, when the directory cannot be listed", () => {
    vi.stubEnv("COURIER_LOG_LEVEL", "debug");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const missing = join(dir, "missing");

    pruneTransformCache(missing);

    expect(debug).toHaveBeenCalledTimes(1);
    expect(String(debug.mock.calls[0]?.[1])).toContain(`cannot list ${missing} to prune it`);
  });
});
