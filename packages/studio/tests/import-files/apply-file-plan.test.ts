/**
 * Applying an import's file plan on a real project directory: all of it or
 * none of it, with a backup of every file replaced or removed, and a journal
 * that lets the next start undo an apply a crash cut short.
 */
import type * as Fs from "node:fs";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyFilePlan } from "../../src/server/import-files/apply-file-plan";
import { saveJournal } from "../../src/server/import-files/apply-journal";
import { bodyHash } from "../../src/server/import-files/body-hash";
import type { PlanTarget } from "../../src/server/import-files/file-plan-types";
import { readGeneratedFile } from "../../src/server/import-files/generated-header";
import { planFiles } from "../../src/server/import-files/plan-files";
import type { RecordedFile } from "../../src/server/import-files/recorded-file";
import { recoverInterruptedApplies } from "../../src/server/import-files/recover-interrupted-applies";
import { type ProjectRoot, projectRootAt } from "../../src/server/project-fs/project-root";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return { ...actual, renameSync: vi.fn(actual.renameSync), linkSync: vi.fn(actual.linkSync) };
});

const IS_WINDOWS = process.platform === "win32";
const IS_ROOT = process.getuid?.() === 0;
const DIR = "src/api/pets";

let scratch: string;
let root: ProjectRoot;

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-apply-plan-")));
  mkdirSync(join(scratch, "proj"));
  root = projectRootAt(join(scratch, "proj"));
});

afterEach(() => {
  vi.mocked(renameSync).mockReset();
  vi.mocked(linkSync).mockReset();
  vi.restoreAllMocks();
  rmSync(scratch, { recursive: true, force: true });
});

function put(path: string, content: string): void {
  mkdirSync(dirname(join(root.path, path)), { recursive: true });
  writeFileSync(join(root.path, path), content);
}

function read(path: string): string {
  return readFileSync(join(root.path, path), "utf8");
}

function generated(path: string, body: string): PlanTarget {
  return { path, body, kind: "generated", endpoints: {} };
}

/* A project with one recorded file to replace, one to remove, and a target to create. */
function scenario() {
  put(`${DIR}/index.ts`, "old index\n");
  put(`${DIR}/old/index.ts`, "old group\n");
  const recorded: Record<string, RecordedFile> = {
    [`${DIR}/index.ts`]: { sha256: bodyHash("old index\n") },
    [`${DIR}/old/index.ts`]: { sha256: bodyHash("old group\n") },
  };
  return planFiles(
    root,
    {
      importName: "pets",
      dir: DIR,
      targets: [generated(`${DIR}/index.ts`, "new index\n"), generated(`${DIR}/new/index.ts`, "new group\n")],
      removals: [`${DIR}/old/index.ts`],
    },
    recorded,
  );
}

function undisturbed(): void {
  expect(read(`${DIR}/index.ts`)).toBe("old index\n");
  expect(read(`${DIR}/old/index.ts`)).toBe("old group\n");
  expect(existsSync(join(root.path, `${DIR}/new`))).toBe(false);
  expect(readdirSync(join(root.path, DIR)).sort()).toEqual(["index.ts", "old"]);
}

describe("applyFilePlan", () => {
  it("writes and removes, with Studio's header, and keeps a backup of what it replaced and removed", () => {
    const committed = vi.fn();

    const report = applyFilePlan(root, scenario(), committed);

    expect(committed).toHaveBeenCalledOnce();
    expect(committed).toHaveBeenCalledWith(report.backupDir.replace(".courier/backups/", ""));
    expect(readGeneratedFile(read(`${DIR}/index.ts`))).toEqual({
      header: { import: "pets", sha256: bodyHash("new index\n") },
      body: "new index\n",
    });
    expect(readGeneratedFile(read(`${DIR}/new/index.ts`)).body).toBe("new group\n");
    expect(existsSync(join(root.path, `${DIR}/old`))).toBe(false);
    expect(read(`${report.backupDir}/${DIR}/index.ts`)).toBe("old index\n");
    expect(read(`${report.backupDir}/${DIR}/old/index.ts`)).toBe("old group\n");
    expect(readdirSync(join(root.path, ".courier/journal"))).toEqual([]);
    expect(report).toMatchObject({ written: [`${DIR}/index.ts`, `${DIR}/new/index.ts`], removed: [`${DIR}/old/index.ts`] });
  });

  it("undoes everything when recording the outcome fails", () => {
    const failure = new Error("disk full");

    expect(() =>
      applyFilePlan(root, scenario(), () => {
        throw failure;
      }),
    ).toThrow(failure);

    undisturbed();
    expect(readdirSync(join(root.path, ".courier/journal"))).toEqual([]);
  });

  it("undoes everything when a file cannot be put in place halfway", async () => {
    const actual = await vi.importActual<typeof Fs>("node:fs");
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (String(to).endsWith(`${DIR}/new/index.ts`)) {
        throw Object.assign(new Error("EIO: injected"), { code: "EIO" });
      }
      actual.renameSync(from, to);
    });

    expect(() => applyFilePlan(root, scenario(), () => {})).toThrow(/EIO/);

    vi.mocked(renameSync).mockImplementation(actual.renameSync);
    undisturbed();
  });

  it("undoes the staged files when its journal cannot be recorded", async () => {
    const actual = await vi.importActual<typeof Fs>("node:fs");
    let journalSaves = 0;
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (String(to).includes(".courier/journal/") && ++journalSaves === 2) {
        throw Object.assign(new Error("ENOSPC: injected"), { code: "ENOSPC" });
      }
      actual.renameSync(from, to);
    });

    expect(() => applyFilePlan(root, scenario(), () => {})).toThrow(/ENOSPC/);

    vi.mocked(renameSync).mockImplementation(actual.renameSync);
    undisturbed();
    expect(readdirSync(join(root.path, DIR)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("refuses a plan the files changed under, writing nothing", () => {
    const plan = scenario();
    put(`${DIR}/index.ts`, "edited meanwhile\n");

    expect(() => applyFilePlan(root, plan, () => {})).toThrow(expect.objectContaining({ code: "PLAN_STALE" }));
    expect(read(`${DIR}/index.ts`)).toBe("edited meanwhile\n");
    expect(existsSync(join(root.path, `${DIR}/new`))).toBe(false);
  });

  it("refuses a plan with steps still waiting for consent", () => {
    put(`${DIR}/index.ts`, "hand-written\n");
    const plan = planFiles(
      root,
      { importName: "pets", dir: DIR, targets: [generated(`${DIR}/index.ts`, "new\n")], removals: [] },
      {},
    );

    expect(() => applyFilePlan(root, plan, () => {})).toThrow(expect.objectContaining({ code: "NEEDS_CONFIRMATION" }));
    expect(read(`${DIR}/index.ts`)).toBe("hand-written\n");
  });

  it("copies what it replaces where the file system has no hard links", () => {
    vi.mocked(linkSync).mockImplementation(() => {
      throw Object.assign(new Error("EPERM: injected"), { code: "EPERM" });
    });

    const report = applyFilePlan(root, scenario(), () => {});

    expect(read(`${report.backupDir}/${DIR}/index.ts`)).toBe("old index\n");
  });

  it.skipIf(IS_WINDOWS || IS_ROOT)("reports, and logs, an emptied directory it could not remove", () => {
    put(`${DIR}/old/index.ts`, "old group\n");
    const plan = planFiles(
      root,
      { importName: "pets", dir: DIR, targets: [], removals: [`${DIR}/old/index.ts`] },
      { [`${DIR}/old/index.ts`]: { sha256: bodyHash("old group\n") } },
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    chmodSync(join(root.path, DIR), 0o555);
    let report: ReturnType<typeof applyFilePlan>;
    try {
      report = applyFilePlan(root, plan, () => {});
    } finally {
      chmodSync(join(root.path, DIR), 0o755);
    }

    expect(report.pruneFailures).toEqual([{ path: `${DIR}/old`, code: "EACCES" }]);
    expect(existsSync(join(root.path, `${DIR}/old/index.ts`))).toBe(false);
    expect(warn).toHaveBeenCalledWith("%s", expect.stringContaining(`emptied directory ${DIR}/old (EACCES)`));
  });
});

describe("recoverInterruptedApplies", () => {
  it("undoes an apply a crash cut short: the replaced file comes back, the created one goes", () => {
    put(`${DIR}/index.ts`, "new index\n");
    put(`${DIR}/new/index.ts`, "new group\n");
    put(`.courier/backups/1-crash/${DIR}/index.ts`, "old index\n");
    put(`.courier/backups/1-crash/${DIR}/old/index.ts`, "old group\n");
    saveJournal(root.path, {
      id: "1-crash",
      importName: "pets",
      state: "committing",
      backupDir: ".courier/backups/1-crash",
      entries: [
        { path: `${DIR}/index.ts`, step: "write", existed: true, sha256: bodyHash("new index\n") },
        { path: `${DIR}/new/index.ts`, step: "write", existed: false, sha256: bodyHash("new group\n") },
        { path: `${DIR}/old/index.ts`, step: "remove", existed: true },
      ],
      createdDirs: [`${DIR}/new`],
      temps: [],
    });

    const recovered = recoverInterruptedApplies(root, new Set());

    expect(recovered).toEqual([{ importName: "pets", failed: [], backupDir: ".courier/backups/1-crash" }]);
    undisturbed();
    expect(readdirSync(join(root.path, ".courier/journal"))).toEqual([]);
  });

  it("leaves an apply the imports state recorded as it stands, and only drops its journal", () => {
    crashedApply();

    const recovered = recoverInterruptedApplies(root, new Set(["1-crash"]));

    expect(recovered).toEqual([]);
    expect(read(`${DIR}/index.ts`)).toBe("new index\n");
    expect(read(`${DIR}/new/index.ts`)).toBe("new group\n");
    expect(existsSync(join(root.path, `${DIR}/old/index.ts`))).toBe(false);
    expect(readdirSync(join(root.path, ".courier/journal"))).toEqual([]);
  });

  it("leaves a file changed after the apply, and a file put where it removed one, keeping the earlier versions", () => {
    crashedApply();
    put(`${DIR}/index.ts`, "new index\nmy edit\n");
    put(`${DIR}/old/index.ts`, "a file of my own\n");

    const [recovered] = recoverInterruptedApplies(root, new Set());

    expect(recovered?.failed.sort()).toEqual([`${DIR}/index.ts`, `${DIR}/old/index.ts`]);
    expect(read(`${DIR}/index.ts`)).toBe("new index\nmy edit\n");
    expect(read(`${DIR}/old/index.ts`)).toBe("a file of my own\n");
    expect(read(`.courier/backups/1-crash/${DIR}/index.ts`)).toBe("old index\n");
    expect(read(`.courier/backups/1-crash/${DIR}/old/index.ts`)).toBe("old group\n");
    expect(existsSync(join(root.path, `${DIR}/new/index.ts`))).toBe(false);
  });

  it("changes nothing the apply had not reached yet", () => {
    crashedApply();
    put(`${DIR}/index.ts`, "old index\n");
    put(`${DIR}/old/index.ts`, "old group\n");
    rmSync(join(root.path, `.courier/backups/1-crash/${DIR}/old`), { recursive: true });

    const [recovered] = recoverInterruptedApplies(root, new Set());

    expect(recovered?.failed).toEqual([]);
    expect(read(`${DIR}/index.ts`)).toBe("old index\n");
    expect(read(`${DIR}/old/index.ts`)).toBe("old group\n");
  });
});

describe("an apply that committed", () => {
  it.skipIf(IS_WINDOWS || IS_ROOT)("stands when its journal cannot be deleted, and the next start keeps it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const journals = join(root.path, ".courier/journal");
    let applyId = "";

    let report: ReturnType<typeof applyFilePlan>;
    try {
      report = applyFilePlan(root, scenario(), (id) => {
        applyId = id;
        chmodSync(journals, 0o555);
      });
    } finally {
      chmodSync(journals, 0o755);
    }
    const left = readdirSync(journals);
    const recovered = recoverInterruptedApplies(root, new Set([applyId]));

    expect(left).toEqual([`${applyId}.json`]);
    expect(report.written).toEqual([`${DIR}/index.ts`, `${DIR}/new/index.ts`]);
    expect(recovered).toEqual([]);
    expect(readGeneratedFile(read(`${DIR}/index.ts`)).body).toBe("new index\n");
    expect(readdirSync(journals)).toEqual([]);
  });
});

/* What a crash leaves after the files of the scenario's apply were put in place. */
function crashedApply(): void {
  put(`${DIR}/index.ts`, "new index\n");
  put(`${DIR}/new/index.ts`, "new group\n");
  put(`.courier/backups/1-crash/${DIR}/index.ts`, "old index\n");
  put(`.courier/backups/1-crash/${DIR}/old/index.ts`, "old group\n");
  saveJournal(root.path, {
    id: "1-crash",
    importName: "pets",
    state: "committing",
    backupDir: ".courier/backups/1-crash",
    entries: [
      { path: `${DIR}/index.ts`, step: "write", existed: true, sha256: bodyHash("new index\n") },
      { path: `${DIR}/new/index.ts`, step: "write", existed: false, sha256: bodyHash("new group\n") },
      { path: `${DIR}/old/index.ts`, step: "remove", existed: true },
    ],
    createdDirs: [`${DIR}/new`],
    temps: [],
  });
}
