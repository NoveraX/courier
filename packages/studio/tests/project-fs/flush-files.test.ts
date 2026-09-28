/**
 * Flushing many files at once, off the thread that serves requests: every
 * file is flushed, more of them than may be open at once included, and a
 * file that cannot be flushed fails the flush unless the caller tolerates it.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flushFiles } from "../../src/server/project-fs/flush-files";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-flush-files-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function files(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const path = join(dir, `f${i}.txt`);
    writeFileSync(path, `${i}\n`);
    return path;
  });
}

describe("flushFiles", () => {
  it("flushes hundreds of files, a few at a time", async () => {
    await expect(flushFiles(files(300))).resolves.toBeUndefined();
  });

  it("fails on a file it cannot flush", async () => {
    await expect(flushFiles([...files(3), join(dir, "gone.txt")])).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("hands a file it cannot flush to the caller that tolerates it, and flushes the rest", async () => {
    const tolerate = vi.fn();
    const gone = join(dir, "gone.txt");

    await flushFiles([...files(3), gone], tolerate);

    expect(tolerate).toHaveBeenCalledOnce();
    expect(tolerate).toHaveBeenCalledWith(gone, expect.objectContaining({ code: "ENOENT" }));
  });
});
