/**
 * Studio's working directory in a project, and the project's own files.
 *
 * Studio kept `.courier/` out of git by appending to the project's .gitignore
 * on every start — through the programmatic API too — and crashed when the
 * project root was mistyped. The directory now ignores itself.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resetProjectRoot } from "../src/context";
import { ensureCourierDir } from "../src/server/courier-dir";
import { openStudioDb } from "../src/server/storage/studio-db";

const roots: string[] = [];

afterEach(() => {
  resetProjectRoot();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "courier-dir-"));
  roots.push(root);
  return root;
}

describe(".courier/", () => {
  it("ignores itself", () => {
    const root = project();

    const dir = ensureCourierDir(root);

    expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toMatch(/^\*$/m);
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
  });

  it("is created ignoring itself when Studio first opens its database there", () => {
    const root = project();

    openStudioDb(root).close();

    expect(existsSync(join(root, ".courier", ".gitignore"))).toBe(true);
    expect(existsSync(join(root, ".courier", "studio.db"))).toBe(true);
  });
});
