import { mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { watchedState } from "../src/server/watched-state";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-watched-state-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("watchedState", () => {
  it("is null where nothing is", () => {
    expect(watchedState(join(root, "absent.ts"))).toBeNull();
  });

  it("is the timestamps, size and inode of what is there", () => {
    const file = join(root, "a.ts");
    writeFileSync(file, "export {};");
    const stats = statSync(file);

    expect(watchedState(file)).toEqual({
      mtimeMs: stats.mtimeMs,
      ctimeMs: stats.ctimeMs,
      size: stats.size,
      ino: stats.ino,
      error: null,
    });
  });

  it.skipIf(process.platform === "win32")("is the error of a path that cannot be looked up", () => {
    const loop = join(root, "loop");
    symlinkSync(loop, loop);

    expect(watchedState(loop)).toMatchObject({ error: "ELOOP" });
  });
});
