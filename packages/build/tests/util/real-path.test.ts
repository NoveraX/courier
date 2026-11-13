/**
 * @vitest-environment node
 *
 * A path by the name the file system gives it, which a watcher and the
 * code a reading runs are compared by: a link to a folder resolved, and a
 * folder that is not there named from the nearest one above it that is.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { realFile, realFolder } from "../../src/util/real-path";

let made: string | undefined;

afterEach(() => {
  if (made !== undefined) rmSync(made, { recursive: true, force: true });
  made = undefined;
});

function project(): string {
  made = realpathSync.native(mkdtempSync(join(tmpdir(), "courier-real-path-")));
  mkdirSync(join(made, "app/switches"), { recursive: true });
  symlinkSync(join(made, "app"), join(made, "app-link"), "dir");
  return made;
}

describe("a path by its real name", () => {
  it("is the folder a link leads to, and the file in it", () => {
    const root = project();

    expect(realFolder(join(root, "app-link/switches"))).toBe(join(root, "app/switches"));
    expect(realFile(join(root, "app-link/switches/payments"))).toBe(
      join(root, "app/switches/payments"),
    );
  });

  it("is named from the nearest folder that is there, for one that is not", () => {
    const root = project();

    expect(realFolder(join(root, "app-link/gone/deeper"))).toBe(join(root, "app/gone/deeper"));
    expect(realFile(join(root, "app-link/gone/flags.json"))).toBe(
      join(root, "app/gone/flags.json"),
    );
  });
});
