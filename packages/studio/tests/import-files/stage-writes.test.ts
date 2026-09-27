/**
 * Staging an apply's files: the folders it creates are in the journal on
 * disk before the first is made, and the journal is saved a fixed number of
 * times however many files the apply writes.
 */
import type * as Fs from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyFilePlan } from "../../src/server/import-files/apply-file-plan";
import { type ApplyJournal, readJournals, saveJournal } from "../../src/server/import-files/apply-journal";
import type { PlanTarget } from "../../src/server/import-files/file-plan-types";
import { planFiles } from "../../src/server/import-files/plan-files";
import { recoverInterruptedApplies } from "../../src/server/import-files/recover-interrupted-applies";
import { stageWrites } from "../../src/server/import-files/stage-writes";
import { type ProjectRoot, projectRootAt } from "../../src/server/project-fs/project-root";
import { writeTempBeside } from "../../src/server/project-fs/write-temp-beside";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});
vi.mock("../../src/server/project-fs/write-temp-beside", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/server/project-fs/write-temp-beside")>();
  return { writeTempBeside: vi.fn(actual.writeTempBeside) };
});

const DIR = "src/api/pets";
const ID = "1700000000000-0000c0de";

let scratch: string;
let root: ProjectRoot;

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-stage-writes-")));
  mkdirSync(join(scratch, "proj"));
  root = projectRootAt(join(scratch, "proj"));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(scratch, { recursive: true, force: true });
});

function generated(path: string): PlanTarget {
  return { path, body: `export const at = "${path}";\n`, kind: "generated", endpoints: {} };
}

function planOf(paths: string[]) {
  return planFiles(root, { importName: "pets", dir: DIR, targets: paths.map(generated), removals: [] }, {});
}

describe("stageWrites", () => {
  it("has every folder it creates in the journal on disk when it stops before a file is staged", () => {
    const journal: ApplyJournal = {
      id: ID,
      importName: "pets",
      dir: DIR,
      state: "staging",
      backupDir: `.courier/backups/${ID}`,
      entries: [],
      createdDirs: [],
      temps: [],
    };
    saveJournal(root.path, journal);
    const actual = vi.mocked(writeTempBeside).getMockImplementation();
    vi.mocked(writeTempBeside).mockImplementation((path, ...rest) => {
      if (path.includes(`${DIR}/users`)) throw new Error("killed");
      return actual ? actual(path, ...rest) : "";
    });

    expect(() => stageWrites(root, planOf([`${DIR}/users/index.ts`]), journal)).toThrow("killed");

    const [onDisk] = readJournals(root.path);
    expect(onDisk?.journal.createdDirs).toEqual(["src", "src/api", DIR, `${DIR}/users`]);
    expect(existsSync(join(root.path, `${DIR}/users`))).toBe(true);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    recoverInterruptedApplies(root, new Set());
    expect(existsSync(join(root.path, "src"))).toBe(false);
  });
});

describe("applying many files", () => {
  it("saves its journal three times, whatever the number of files", () => {
    let saves = 0;
    const actual = vi.mocked(renameSync).getMockImplementation();
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (String(to).includes(".courier/journal/")) saves += 1;
      actual?.(from, to);
    });
    const paths = Array.from({ length: 12 }, (_, index) => `${DIR}/group${index}/index.ts`);

    applyFilePlan(root, planOf(paths), () => {});

    expect(saves).toBe(3);
    expect(existsSync(join(root.path, `${DIR}/group11/index.ts`))).toBe(true);
  });
});
