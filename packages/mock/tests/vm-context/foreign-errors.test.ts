/**
 * A mock started from a test file Jest runs, in a context of its own, where
 * an error Node makes is no instance of the context's `Error`. Told so, a
 * recording mock whose HAR file was not written yet failed on the file
 * system's ENOENT rather than starting with no recordings.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readFixtureFile } from "../../src/record/fixture-file";

describe("a HAR file not written yet", () => {
  it("holds no recordings", () => {
    const file = join(mkdtempSync(join(tmpdir(), "courier-mock-")), "absent.har");

    expect(readFixtureFile(file)).toEqual([]);
  });
});
