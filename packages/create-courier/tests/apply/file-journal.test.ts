import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { FileJournal } from "../../src/apply/file-journal";
import { SetupFailure } from "../../src/apply/setup-failure";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");

function failureOf(write: () => void): SetupFailure | undefined {
  try {
    write();
  } catch (error) {
    if (error instanceof SetupFailure) return error;
    throw error;
  }
  return undefined;
}

describe("FileJournal", () => {
  it("adds files in folders it makes, changes files, and undoes all of it, the folders too", () => {
    const root = projectWith({ "vite.config.ts": "before\n" });
    const journal = new FileJournal(root);

    journal.create("src/courier/api.ts", "api\n");
    journal.create("courier.config.ts", "config\n");
    journal.replace("vite.config.ts", "before\n", "after\n");

    expect(journal.written).toEqual(["src/courier/api.ts", "courier.config.ts"]);
    expect(journal.changed).toEqual(["vite.config.ts"]);
    expect(read(root, "src/courier/api.ts")).toBe("api\n");
    expect(read(root, "vite.config.ts")).toBe("after\n");
    expect(journal.undo()).toEqual({
      removed: ["courier.config.ts", "src/courier/api.ts"],
      putBack: ["vite.config.ts"],
      kept: [],
    });
    expect(existsSync(join(root, "src"))).toBe(false);
    expect(read(root, "vite.config.ts")).toBe("before\n");
  });

  it("replaces no file that is there, and changes no file that changed since it was read", () => {
    const root = projectWith({ "courier.config.ts": "yours\n", "vite.config.ts": "edited\n" });
    const journal = new FileJournal(root);

    expect(failureOf(() => journal.create("courier.config.ts", "ours\n"))?.code).toBe(
      "FILE_APPEARED",
    );
    expect(failureOf(() => journal.replace("vite.config.ts", "planned\n", "after\n"))?.code).toBe(
      "FILE_CHANGED",
    );
    expect(read(root, "courier.config.ts")).toBe("yours\n");
    expect(read(root, "vite.config.ts")).toBe("edited\n");
    expect(journal.written).toEqual([]);
  });

  it("keeps, and names, a file changed after it was written, and a folder that holds other files", () => {
    const root = projectWith({ "vite.config.ts": "before\n" });
    const journal = new FileJournal(root);
    journal.create("src/courier/api.ts", "api\n");
    journal.replace("vite.config.ts", "before\n", "after\n");

    writeFileSync(join(root, "vite.config.ts"), "after, and yours\n");
    writeFileSync(join(root, "src/courier/yours.ts"), "yours\n");

    expect(journal.undo()).toEqual({
      removed: ["src/courier/api.ts"],
      putBack: [],
      kept: [
        {
          path: "vite.config.ts",
          why: "it changed since the setup wrote it, so it was left as it is",
        },
        { path: "src/courier", why: "it holds files the setup did not write" },
      ],
    });
    expect(read(root, "src/courier/yours.ts")).toBe("yours\n");
  });

  it("refuses a path that leads out of the project, by .. or through a link, before writing there", () => {
    const outside = projectWith({});
    const root = projectWith({});
    /* A junction is a link to a folder Windows makes without a developer's rights; elsewhere it is a symbolic link. */
    symlinkSync(outside, join(root, "linked"), "junction");
    const journal = new FileJournal(root);

    expect(failureOf(() => journal.create("linked/api.ts", "api\n"))?.code).toBe(
      "PATH_OUTSIDE_PROJECT",
    );
    expect(failureOf(() => journal.create("../escaped.ts", "api\n"))?.code).toBe(
      "PATH_OUTSIDE_PROJECT",
    );
    expect(existsSync(join(outside, "api.ts"))).toBe(false);
  });

  it("writes a file of the project's that links to another inside it where that one is", () => {
    const root = projectWith({ "config/vite.config.ts": "before\n" });
    mkdirSync(join(root, "app"));
    symlinkSync(join(root, "config"), join(root, "app/config"), "junction");
    const journal = new FileJournal(root);

    journal.replace("app/config/vite.config.ts", "before\n", "after\n");

    expect(read(root, "config/vite.config.ts")).toBe("after\n");
  });

  it("names the file a write failed on, as the file system said", () => {
    const root = projectWith({ "src/courier": "a file where a folder goes\n" });
    const journal = new FileJournal(root);

    const failure = failureOf(() => journal.create("src/courier/api.ts", "api\n"));

    expect(failure?.code).toBe("WRITE_FAILED");
    expect(failure?.message).toMatch(/^src\/courier\/api\.ts could not be written: /);
  });
});
