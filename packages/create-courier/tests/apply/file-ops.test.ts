import { chmodSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { replaceFile } from "../../src/apply/file-ops";
import { projectWith, removeProjects } from "../recipes/project-fixture";

const fs = vi.hoisted(() => ({ refusals: 0, code: "EPERM", renames: 0 }));

/* Windows' refusal of a rename, on any system: the first `fs.refusals` renames fail with `fs.code`. */
vi.mock("node:fs", async (original) => {
  const real = await original<typeof import("node:fs")>();
  return {
    ...real,
    renameSync: (from: string, to: string) => {
      fs.renames++;
      if (fs.renames <= fs.refusals)
        throw Object.assign(new Error(`${fs.code}: rename '${to}'`), { code: fs.code });
      real.renameSync(from, to);
    },
  };
});

const REAL_PLATFORM = process.platform;

afterEach(() => {
  Object.defineProperty(process, "platform", { value: REAL_PLATFORM, configurable: true });
  Object.assign(fs, { refusals: 0, code: "EPERM", renames: 0 });
});
afterAll(removeProjects);

describe("replaceFile on Windows", () => {
  it("does not wait for a read-only file, which no wait lets a rename replace", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    const root = projectWith({ "AGENTS.md": "# Rules\n" });
    const path = join(root, "AGENTS.md");
    chmodSync(path, 0o444);
    fs.refusals = Number.POSITIVE_INFINITY;

    try {
      expect(() => replaceFile(path, "# New rules\n")).toThrow(/EPERM/);
      expect(fs.renames).toBe(1);
      expect(readFileSync(path, "utf8")).toBe("# Rules\n");
      expect(readdirSync(root)).toEqual(["AGENTS.md"]);
    } finally {
      chmodSync(path, 0o644);
    }
  });

  it("waits while another program holds a file it may write, then replaces it", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    const root = projectWith({ "AGENTS.md": "# Rules\n" });
    const path = join(root, "AGENTS.md");
    Object.assign(fs, { refusals: 2, code: "EBUSY" });

    replaceFile(path, "# New rules\n");

    expect(fs.renames).toBe(3);
    expect(readFileSync(path, "utf8")).toBe("# New rules\n");
  });
});
