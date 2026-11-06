import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { FileJournal } from "../../src/apply/file-journal";
import { SetupFailure } from "../../src/apply/setup-failure";
import { checkEditsCurrent, writePlan } from "../../src/apply/write-plan";
import type { Plan, PlannedEdit } from "../../src/plan/build-plan";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const BEFORE = `${JSON.stringify({ name: "app", scripts: { dev: "vite" } }, null, 2)}\n`;

/* The edit a setup makes to package.json: a script, added to the scripts it has. */
const SCRIPT_EDIT: PlannedEdit = {
  path: "package.json",
  purpose: "adds Courier's scripts",
  state: "edit",
  before: BEFORE,
  after: BEFORE.replace('"dev": "vite"', '"dev": "vite",\n    "studio": "courier-studio"'),
  change: (text) => text.replace('"dev": "vite"', '"dev": "vite",\n    "studio": "courier-studio"'),
};

function planOf(edits: readonly PlannedEdit[]): Plan {
  return {
    files: [],
    edits,
    dependencies: [],
    devDependencies: [],
    otherReleases: [],
    notInstalled: [],
    typescript: undefined,
    manual: [],
    next: [],
    leftOut: [],
    prepare: [],
  };
}

function codeOf(write: () => void): string | undefined {
  try {
    write();
  } catch (error) {
    if (error instanceof SetupFailure) return error.code;
    throw error;
  }
  return undefined;
}

describe("writePlan", () => {
  it("makes the plan's changes again to package.json once the install has written its packages into it", () => {
    const root = projectWith({ "package.json": BEFORE });
    const installed = { name: "app", scripts: { dev: "vite" }, dependencies: { zod: "^4.6.5" } };
    writeFileSync(join(root, "package.json"), `${JSON.stringify(installed, null, 2)}\n`);

    writePlan(new FileJournal(root), root, planOf([SCRIPT_EDIT]));

    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8"))).toEqual({
      name: "app",
      scripts: { dev: "vite", studio: "courier-studio" },
      dependencies: { zod: "^4.6.5" },
    });
  });

  it("stops at package.json where something but its packages changed since the plan", () => {
    const root = projectWith({ "package.json": BEFORE });
    writeFileSync(join(root, "package.json"), BEFORE.replace('"app"', '"renamed"'));

    expect(codeOf(() => writePlan(new FileJournal(root), root, planOf([SCRIPT_EDIT])))).toBe(
      "FILE_CHANGED",
    );
  });

  it("stops at any other file that changed since the plan, and before anything is installed", () => {
    const root = projectWith({ "vite.config.ts": "yours, edited\n" });
    const edit = { ...SCRIPT_EDIT, path: "vite.config.ts", before: "planned\n" };

    expect(codeOf(() => checkEditsCurrent(root, [edit]))).toBe("FILE_CHANGED");
    expect(codeOf(() => writePlan(new FileJournal(root), root, planOf([edit])))).toBe(
      "FILE_CHANGED",
    );
  });
});
