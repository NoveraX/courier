/**
 * Self-test for `scripts/check-name-conflicts.mjs`. Builds throwaway
 * fixtures in `os.tmpdir()` covering the three conflict shapes that
 * motivated the guard plus the intentional split pattern that must NOT
 * be flagged. The script's `findConflicts()` is exported for the sole
 * purpose of being callable from this test (CLI entry remains guarded
 * by the `invokedAsScript` check at the bottom of the script).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findConflicts } from "./check-name-conflicts.mjs";

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "check-name-conflicts-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function touch(relPath, contents = "") {
  const abs = join(root, relPath);
  const dir = abs.slice(0, abs.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(abs, contents);
}

describe("findConflicts", () => {
  it("flags `studio.ts` next to `studio/index.ts`", () => {
    touch("studio.ts", "export {};");
    touch("studio/index.ts", "export {};");

    const conflicts = findConflicts(root);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      file: "studio.ts",
      conflictingDir: "studio",
    });
  });

  it("flags `logger.ts` next to `logger/index.ts`", () => {
    touch("logger.ts", "export {};");
    touch("logger/index.ts", "export {};");

    const conflicts = findConflicts(root);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].file).toBe("logger.ts");
  });

  it("flags nested conflicts `mock/server.ts` + `mock/server/index.ts`", () => {
    touch("mock/server.ts", "export {};");
    touch("mock/server/index.ts", "export {};");

    const conflicts = findConflicts(root);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      file: "server.ts",
      conflictingDir: "server",
    });
  });

  it("does NOT flag intentional splits where the sibling dir has no index file", () => {
    // adapter.ts + adapter/foo.ts (no adapter/index.ts) is the deliberate
    // pattern for explicit subpath imports only.
    touch("adapter.ts", "export {};");
    touch("adapter/foo.ts", "export {};");

    expect(findConflicts(root)).toHaveLength(0);
  });

  it("does NOT flag a `.tsx` file next to a directory without index", () => {
    touch("Button.tsx", "export {};");
    touch("Button/icon.tsx", "export {};");

    expect(findConflicts(root)).toHaveLength(0);
  });

  it("flags `.tsx` file next to directory with `index.tsx`", () => {
    touch("Card.tsx", "export {};");
    touch("Card/index.tsx", "export {};");

    const conflicts = findConflicts(root);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].file).toBe("Card.tsx");
  });

  it("skips `node_modules`, `dist`, `.turbo`, `coverage` directories", () => {
    touch("node_modules/foo.ts");
    touch("node_modules/foo/index.ts");
    touch("dist/bar.ts");
    touch("dist/bar/index.ts");
    touch(".turbo/baz.ts");
    touch(".turbo/baz/index.ts");
    touch("coverage/qux.ts");
    touch("coverage/qux/index.ts");

    expect(findConflicts(root)).toHaveLength(0);
  });

  it("returns empty array for an empty directory tree", () => {
    expect(findConflicts(root)).toHaveLength(0);
  });

  it("returns empty array for a non-existent directory (no throw)", () => {
    expect(findConflicts(join(root, "does-not-exist"))).toHaveLength(0);
  });

  it("finds multiple conflicts across nested subdirectories in one pass", () => {
    touch("a.ts");
    touch("a/index.ts");
    touch("nested/b.ts");
    touch("nested/b/index.ts");

    const conflicts = findConflicts(root);
    expect(conflicts).toHaveLength(2);
    const files = conflicts.map((c) => c.file).sort();
    expect(files).toEqual(["a.ts", "b.ts"]);
  });
});
