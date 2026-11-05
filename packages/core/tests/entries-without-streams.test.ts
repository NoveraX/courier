/**
 * The entries a React Native app imports — the package's own, its
 * definitions, and the client pieces React's hooks take — load where the
 * runtime has no Web Streams. A module that touched `ReadableStream` as it
 * loaded — a class that extended it — failed every import of the package
 * there.
 */
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const source = (path: string): string => pathToFileURL(join(__dirname, "../src", path)).href;

describe("Courier's entries", () => {
  it("load in a runtime with no Web Streams", { timeout: 60_000 }, async () => {
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

    const { stdout } = await run(process.execPath, [
      "--import",
      tsx,
      join(__dirname, "fixtures/entries-without-streams.ts"),
      source("index.ts"),
      source("define/index.ts"),
      source("internal-client/index.ts"),
    ]);

    expect(JSON.parse(stdout)).toEqual([]);
  });
});
