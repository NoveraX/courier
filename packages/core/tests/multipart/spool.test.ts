/**
 * An upload's folder that a process leaves behind when it exits mid-call:
 * removed as the process exits, since the call that would have removed it
 * never ends.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "courier-spool-test-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("an upload's folder", () => {
  it("is removed when the process exits before the call lets it go", () => {
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
    const script = join(__dirname, "../fixtures/spool-left-at-exit.ts");

    const run = spawnSync(process.execPath, ["--import", tsx, script, directory], {
      encoding: "utf8",
      timeout: 30_000,
    });

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toBe("1");
    expect(readdirSync(directory)).toEqual([]);
  });
});
