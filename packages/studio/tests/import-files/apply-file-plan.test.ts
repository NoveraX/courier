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

import type { ImportStateEntry } from "../../src/apis/imports-state";
import { applyFilePlan } from "../../src/server/import-files/apply-file-plan";
import {
  type ApplyJournal,
  type JournalEntry,
  readJournals,
  saveJournal,
} from "../../src/server/import-files/apply-journal";
import { bodyHash } from "../../src/server/import-files/body-hash";
import { exactHash } from "../../src/server/import-files/exact-hash";
import type { PlanTarget } from "../../src/server/import-files/file-plan-types";
import { readGeneratedFile, signGeneratedFile } from "../../src/server/import-files/generated-header";
import { planFiles } from "../../src/server/import-files/plan-files";
import { pruneBackups } from "../../src/server/import-files/prune-backups";
import type { RecordedFile } from "../../src/server/import-files/recorded-file";
import { recoverInterruptedApplies } from "../../src/server/import-files/recover-interrupted-applies";
import { saveImportEntry } from "../../src/server/import-files/save-import-entry";
import { undoUnfinishedImportWrites } from "../../src/server/import-files/undo-unfinished-import-writes";
import { withConfirmations } from "../../src/server/import-files/with-confirmations";
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

/* A file as Studio writes it for pets. */
function signed(body: string): string {
  return signGeneratedFile("pets", body);
}

/* The imports state's record of pets, in the folder its applies write to. */
const PETS: ImportStateEntry = { specHash: "h", fetchedAt: "", lastSyncedAt: "", dir: DIR, files: {} };

function bodyOf(path: string): string {
  return readGeneratedFile(read(path)).body;
}

function generated(path: string, body: string): PlanTarget {
  return { path, body, kind: "generated", endpoints: {} };
}

/* A project with one recorded file to replace, one to remove, and a target to create. */
function scenario() {
  put(`${DIR}/index.ts`, signed("old index\n"));
  put(`${DIR}/old/index.ts`, signed("old group\n"));
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
  expect(bodyOf(`${DIR}/index.ts`)).toBe("old index\n");
  expect(bodyOf(`${DIR}/old/index.ts`)).toBe("old group\n");
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
    expect(bodyOf(`${report.backupDir}/${DIR}/index.ts`)).toBe("old index\n");
    expect(bodyOf(`${report.backupDir}/${DIR}/old/index.ts`)).toBe("old group\n");
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

  it("puts back a file of the same text without Studio's header, when the apply that signed it is undone", () => {
    put(`${DIR}/same.ts`, "same\n");
    const plan = planFiles(root, { importName: "pets", dir: DIR, targets: [generated(`${DIR}/same.ts`, "same\n")], removals: [] }, {});
    const failure = new Error("disk full");

    expect(() =>
      applyFilePlan(root, withConfirmations(plan, [`${DIR}/same.ts`]), () => {
        throw failure;
      }),
    ).toThrow(failure);

    expect(read(`${DIR}/same.ts`)).toBe("same\n");
    expect(readdirSync(join(root.path, ".courier/backups"))).toEqual([]);
  });

  it("puts back a file whose lines ended in CRLF, when the apply that rewrote them is undone", () => {
    const original = signed("a\r\nb\r\n");
    put(`${DIR}/crlf.ts`, original);
    const recorded = { [`${DIR}/crlf.ts`]: { sha256: bodyHash("a\r\nb\r\n") } };
    const plan = planFiles(root, { importName: "pets", dir: DIR, targets: [generated(`${DIR}/crlf.ts`, "a\nb\n")], removals: [] }, recorded);
    expect(plan.writes).toMatchObject([{ action: "replace" }]);

    expect(() =>
      applyFilePlan(root, plan, () => {
        throw new Error("disk full");
      }),
    ).toThrow("disk full");

    expect(read(`${DIR}/crlf.ts`)).toBe(original);
  });

  it("keeps no backup when it stops before replacing a file it copied", async () => {
    const actual = await vi.importActual<typeof Fs>("node:fs");
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (String(from).includes(".courier.import.") && String(to).endsWith(`proj/${DIR}/index.ts`)) {
        throw Object.assign(new Error("EIO: injected"), { code: "EIO" });
      }
      actual.renameSync(from, to);
    });

    expect(() => applyFilePlan(root, scenario(), () => {})).toThrow(/EIO/);

    vi.mocked(renameSync).mockImplementation(actual.renameSync);
    undisturbed();
    expect(readdirSync(join(root.path, ".courier/backups"))).toEqual([]);
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

  it("keeps its journal as a record when the undo cannot restore a file, so the copy is not pruned", async () => {
    const actual = await vi.importActual<typeof Fs>("node:fs");
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (String(from).includes(".courier/backups/") && String(to).endsWith(`proj/${DIR}/index.ts`)) {
        throw Object.assign(new Error("EIO: injected"), { code: "EIO" });
      }
      actual.renameSync(from, to);
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = new Error("disk full");

    expect(() =>
      applyFilePlan(root, scenario(), () => {
        throw failure;
      }),
    ).toThrow(failure);

    vi.mocked(renameSync).mockImplementation(actual.renameSync);
    const [name] = readdirSync(join(root.path, ".courier/journal"));
    const journal: unknown = JSON.parse(read(`.courier/journal/${name}`));
    expect(journal).toMatchObject({ state: "kept", entries: [{ path: `${DIR}/index.ts` }], temps: [] });
    pruneBackups(root.path, 0);
    expect(bodyOf(`.courier/backups/${name?.replace(".json", "")}/${DIR}/index.ts`)).toBe("old index\n");
    expect(bodyOf(`${DIR}/old/index.ts`)).toBe("old group\n");
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

  it("removes the import's folder once every group folder in it has gone", () => {
    const paths = [`${DIR}/index.ts`, `${DIR}/a/index.ts`, `${DIR}/b/index.ts`];
    for (const path of paths) put(path, signed(`${path}\n`));
    const recorded = Object.fromEntries(paths.map((path) => [path, { sha256: bodyHash(`${path}\n`) }]));
    const plan = planFiles(root, { importName: "pets", dir: DIR, targets: [], removals: paths }, recorded);

    const report = applyFilePlan(root, plan, () => {});

    expect(report.pruneFailures).toEqual([]);
    expect(existsSync(join(root.path, DIR))).toBe(false);
    expect(existsSync(join(root.path, "src/api"))).toBe(true);
  });

  it("copies what it replaces where the file system has no hard links", () => {
    vi.mocked(linkSync).mockImplementation(() => {
      throw Object.assign(new Error("EPERM: injected"), { code: "EPERM" });
    });

    const report = applyFilePlan(root, scenario(), () => {});

    expect(bodyOf(`${report.backupDir}/${DIR}/index.ts`)).toBe("old index\n");
  });

  it.skipIf(IS_WINDOWS || IS_ROOT)("reports, and logs, an emptied directory it could not remove", () => {
    put(`${DIR}/old/index.ts`, signed("old group\n"));
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
    put(`${DIR}/index.ts`, signed("new index\n"));
    put(`${DIR}/new/index.ts`, signed("new group\n"));
    put(`.courier/backups/1700000000000-0000c0de/${DIR}/index.ts`, signed("old index\n"));
    put(`.courier/backups/1700000000000-0000c0de/${DIR}/old/index.ts`, signed("old group\n"));
    saveJournal(root.path, {
      id: "1700000000000-0000c0de",
      importName: "pets",
      dir: DIR,
      after: null,
      state: "committing",
      backupDir: ".courier/backups/1700000000000-0000c0de",
      entries: [
        { path: `${DIR}/index.ts`, step: "write", existed: true, sha256: exactHash(signed("new index\n")) },
        { path: `${DIR}/new/index.ts`, step: "write", existed: false, sha256: exactHash(signed("new group\n")) },
        { path: `${DIR}/old/index.ts`, step: "remove", existed: true },
      ],
      createdDirs: [`${DIR}/new`],
      temps: [],
    });

    const recovered = recoverInterruptedApplies(root, { applied: [], imports: { pets: PETS } });

    expect(recovered).toEqual([{ importName: "pets", failed: [], backupDir: ".courier/backups/1700000000000-0000c0de" }]);
    undisturbed();
    expect(existsSync(join(root.path, ".courier/backups/1700000000000-0000c0de"))).toBe(false);
    expect(readdirSync(join(root.path, ".courier/journal"))).toEqual([]);
  });

  it("leaves an apply the imports state recorded as it stands, and only drops its journal", () => {
    crashedApply();

    const recovered = recoverInterruptedApplies(root, { applied: ["1700000000000-0000c0de"], imports: { pets: PETS } });

    expect(recovered).toEqual([]);
    expect(bodyOf(`${DIR}/index.ts`)).toBe("new index\n");
    expect(bodyOf(`${DIR}/new/index.ts`)).toBe("new group\n");
    expect(existsSync(join(root.path, `${DIR}/old/index.ts`))).toBe(false);
    expect(readdirSync(join(root.path, ".courier/journal"))).toEqual([]);
  });

  it("leaves a file changed after the apply, and a file put where it removed one, keeping the earlier versions", () => {
    crashedApply();
    put(`${DIR}/index.ts`, "new index\nmy edit\n");
    put(`${DIR}/old/index.ts`, "a file of my own\n");

    const [recovered] = recoverInterruptedApplies(root, { applied: [], imports: { pets: PETS } });

    expect(recovered?.failed.sort()).toEqual([`${DIR}/index.ts`, `${DIR}/old/index.ts`]);
    expect(read(`${DIR}/index.ts`)).toBe("new index\nmy edit\n");
    expect(read(`${DIR}/old/index.ts`)).toBe("a file of my own\n");
    expect(bodyOf(`.courier/backups/1700000000000-0000c0de/${DIR}/index.ts`)).toBe("old index\n");
    expect(bodyOf(`.courier/backups/1700000000000-0000c0de/${DIR}/old/index.ts`)).toBe("old group\n");
    expect(existsSync(join(root.path, `${DIR}/new/index.ts`))).toBe(false);
  });

  it("changes nothing the apply had not reached yet", () => {
    crashedApply();
    put(`${DIR}/index.ts`, signed("old index\n"));
    put(`${DIR}/old/index.ts`, signed("old group\n"));
    rmSync(join(root.path, `.courier/backups/1700000000000-0000c0de/${DIR}/old`), { recursive: true });

    const [recovered] = recoverInterruptedApplies(root, { applied: [], imports: { pets: PETS } });

    expect(recovered?.failed).toEqual([]);
    expect(bodyOf(`${DIR}/index.ts`)).toBe("old index\n");
    expect(bodyOf(`${DIR}/old/index.ts`)).toBe("old group\n");
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
    const recovered = recoverInterruptedApplies(root, { applied: [applyId], imports: { pets: PETS } });

    expect(left).toEqual([`${applyId}.json`]);
    expect(report.written).toEqual([`${DIR}/index.ts`, `${DIR}/new/index.ts`]);
    expect(recovered).toEqual([]);
    expect(readGeneratedFile(read(`${DIR}/index.ts`)).body).toBe("new index\n");
    expect(readdirSync(journals)).toEqual([]);
  });
});

/* What a crash leaves after the files of the scenario's apply were put in place. */
/* The imports state's record of an import, as the apply of the given id saved it. */
function recordOfApply(applyId: string): ImportStateEntry {
  return { specHash: "h", fetchedAt: "", lastSyncedAt: "", dir: DIR, files: {}, applyId };
}

function crashedApply(): void {
  put(`${DIR}/index.ts`, signed("new index\n"));
  put(`${DIR}/new/index.ts`, signed("new group\n"));
  put(`.courier/backups/1700000000000-0000c0de/${DIR}/index.ts`, signed("old index\n"));
  put(`.courier/backups/1700000000000-0000c0de/${DIR}/old/index.ts`, signed("old group\n"));
  saveJournal(root.path, {
    id: "1700000000000-0000c0de",
    importName: "pets",
    dir: DIR,
    after: null,
    state: "committing",
    backupDir: ".courier/backups/1700000000000-0000c0de",
    entries: [
      { path: `${DIR}/index.ts`, step: "write", existed: true, sha256: exactHash(signed("new index\n")) },
      { path: `${DIR}/new/index.ts`, step: "write", existed: false, sha256: exactHash(signed("new group\n")) },
      { path: `${DIR}/old/index.ts`, step: "remove", existed: true },
    ],
    createdDirs: [`${DIR}/new`],
    temps: [],
  });
}

describe("recovering from what a crash left", () => {
  it("deletes Studio's temporary files in the import's folder, those the journal missed too", () => {
    crashedApply();
    put(`${DIR}/new/.courier.import.4242-0a1b2c3d.tmp`, "staged\n");
    put(`${DIR}/.courier.imports.notes.tmp`, "mine\n");

    recoverInterruptedApplies(root, { applied: [], imports: { pets: PETS } });

    expect(existsSync(join(root.path, `${DIR}/new/.courier.import.4242-0a1b2c3d.tmp`))).toBe(false);
    expect(read(`${DIR}/.courier.imports.notes.tmp`)).toBe("mine\n");
  });

  it("reports a file whose copy is gone as not restored, and keeps the journal", () => {
    crashedApply();
    rmSync(join(root.path, `.courier/backups/1700000000000-0000c0de/${DIR}/index.ts`));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const [recovered] = recoverInterruptedApplies(root, { applied: [], imports: { pets: PETS } });

    expect(recovered?.failed).toEqual([`${DIR}/index.ts`]);
    expect(readdirSync(join(root.path, ".courier/journal"))).toEqual(["1700000000000-0000c0de.json"]);
  });

  it("prunes no backup a journal still names", () => {
    crashedApply();
    put(".courier/backups/1690000000000-0000beef/f.ts", "older\n");

    const deleted = pruneBackups(root.path, 0);

    expect(deleted).toEqual([".courier/backups/1690000000000-0000beef"]);
    expect(existsSync(join(root.path, ".courier/backups/1700000000000-0000c0de"))).toBe(true);
  });
});

describe("a journal whose undo left files", () => {
  it("is not replayed: a file put since at a path the apply created stays, and the record names the backup", () => {
    crashedApply();
    put(`${DIR}/index.ts`, "new index\nmy edit\n");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    recoverInterruptedApplies(root, { applied: [], imports: { pets: PETS } });
    put(`${DIR}/new/index.ts`, signed("new group\n"));

    const recovered = recoverInterruptedApplies(root, { applied: [], imports: { pets: PETS } });

    expect(recovered).toEqual([]);
    expect(bodyOf(`${DIR}/new/index.ts`)).toBe("new group\n");
    expect(read(`${DIR}/index.ts`)).toBe("new index\nmy edit\n");
    expect(bodyOf(`.courier/backups/1700000000000-0000c0de/${DIR}/index.ts`)).toBe("old index\n");
    const journal: unknown = JSON.parse(read(".courier/journal/1700000000000-0000c0de.json"));
    expect(journal).toMatchObject({ state: "kept", entries: [{ path: `${DIR}/index.ts` }] });
    expect(warn).toHaveBeenLastCalledWith(
      "%s",
      expect.stringContaining(`${DIR}/index.ts when it undid a write for the import pets; their earlier versions are in .courier/backups/1700000000000-0000c0de`),
    );
  });

  it("goes once its backup folder is deleted", () => {
    crashedApply();
    put(`${DIR}/index.ts`, "new index\nmy edit\n");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    recoverInterruptedApplies(root, { applied: [], imports: { pets: PETS } });
    rmSync(join(root.path, ".courier/backups/1700000000000-0000c0de"), { recursive: true });

    recoverInterruptedApplies(root, { applied: [], imports: { pets: PETS } });

    expect(readdirSync(join(root.path, ".courier/journal"))).toEqual([]);
    expect(read(`${DIR}/index.ts`)).toBe("new index\nmy edit\n");
  });

  it("is not replayed after an apply of the import recorded since, which may have written the same paths", () => {
    crashedApply();
    put(`${DIR}/new/.courier.import.4242-0a1b2c3d.tmp`, "staged\n");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const imports = { pets: recordOfApply("0000000000001-0000beef") };

    const recovered = recoverInterruptedApplies(root, { applied: ["0000000000001-0000beef"], imports });

    expect(recovered).toEqual([]);
    expect(bodyOf(`${DIR}/index.ts`)).toBe("new index\n");
    expect(bodyOf(`${DIR}/new/index.ts`)).toBe("new group\n");
    expect(existsSync(join(root.path, `${DIR}/new/.courier.import.4242-0a1b2c3d.tmp`))).toBe(false);
    const journal: unknown = JSON.parse(read(".courier/journal/1700000000000-0000c0de.json"));
    expect(journal).toMatchObject({ state: "kept", entries: [{}, {}, {}] });
  });
});

describe("a journal of one import", () => {
  it("is replayed after an apply of another import was recorded", () => {
    crashedApply();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const imports = { pets: PETS, store: { ...recordOfApply("1800000000000-0000beef"), dir: "src/api/store" } };

    const recovered = recoverInterruptedApplies(root, { applied: ["1800000000000-0000beef"], imports });

    expect(recovered).toEqual([{ importName: "pets", failed: [], backupDir: ".courier/backups/1700000000000-0000c0de" }]);
    undisturbed();
  });
});

describe("an apply's journal", () => {
  it("names the apply that saved the import's record when it began", () => {
    saveImportEntry(root.path, "pets", recordOfApply("unused"), "0000000000001-0000beef");
    let after: string | null | undefined;

    applyFilePlan(root, scenario(), () => {
      after = readJournals(root.path)[0]?.journal.after;
    });

    expect(after).toBe("0000000000001-0000beef");
  });
});

describe("recovery that nothing on disk can mislead", () => {
  const ID = "1700000000000-0000c0de";
  const journalWith = (entries: JournalEntry[], extra: Partial<ApplyJournal> = {}): void =>
    saveJournal(root.path, {
      id: ID,
      importName: "pets",
      dir: DIR,
      after: null,
      state: "committing",
      backupDir: `.courier/backups/${ID}`,
      entries,
      createdDirs: [],
      temps: [],
      ...extra,
    });

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("leaves a file another import wrote in the same folder since", () => {
    put(`${DIR}/users/index.ts`, signGeneratedFile("petstore", "users\n"));
    journalWith([{ path: `${DIR}/users/index.ts`, step: "write", existed: false, sha256: exactHash(signed("users\n")) }]);
    const petstore = { ...PETS, applyId: "1800000000000-0000beef" };

    recoverInterruptedApplies(root, { applied: ["1800000000000-0000beef"], imports: { petstore } });

    expect(readGeneratedFile(read(`${DIR}/users/index.ts`)).header?.import).toBe("petstore");
  });

  it("leaves an untouched file of the same text alone, whatever its copy holds", () => {
    put(`${DIR}/foreign.ts`, "export const foreign = 1;\r\n");
    put(`.courier/backups/${ID}/${DIR}/foreign.ts`, "export const ");
    journalWith([{ path: `${DIR}/foreign.ts`, step: "write", existed: true, sha256: exactHash(signed("export const foreign = 1;\n")) }]);

    recoverInterruptedApplies(root, { applied: [], imports: { pets: PETS } });

    expect(read(`${DIR}/foreign.ts`)).toBe("export const foreign = 1;\r\n");
  });

  it("does not report a copy gone for a file the apply never reached", () => {
    put(`${DIR}/foreign.ts`, "export const foreign = 1;\n");
    journalWith([{ path: `${DIR}/foreign.ts`, step: "write", existed: true, sha256: exactHash(signed("export const foreign = 1;\n")) }]);

    const [recovered] = recoverInterruptedApplies(root, { applied: [], imports: { pets: PETS } });

    expect(recovered?.failed).toEqual([]);
    expect(readdirSync(join(root.path, ".courier/journal"))).toEqual([]);
  });

  it("touches no file a planted journal names outside the import's recorded folder", () => {
    put("src/main.ts", "export const main = 'mine';\n");
    put("src/index.ts", "export const index = 'mine';\n");
    put(`.courier/backups/${ID}/src/main.ts`, "export const main = 'planted';\n");
    saveJournal(root.path, {
      id: ID,
      importName: "stranger",
      dir: "src",
      after: null,
      state: "committing",
      backupDir: `.courier/backups/${ID}`,
      entries: [
        { path: "src/main.ts", step: "write", existed: true, sha256: exactHash("export const main = 'mine';\n") },
        { path: "src/index.ts", step: "write", existed: false, sha256: exactHash("export const index = 'mine';\n") },
      ],
      createdDirs: [],
      temps: [],
    });

    recoverInterruptedApplies(root, { applied: [], imports: {} });

    expect(read("src/main.ts")).toBe("export const main = 'mine';\n");
    expect(read("src/index.ts")).toBe("export const index = 'mine';\n");
  });

  it("drops the journal of the apply the import's record was saved by", () => {
    journalWith([{ path: `${DIR}/index.ts`, step: "write", existed: false, sha256: exactHash(signed("x\n")) }]);
    put(`${DIR}/index.ts`, signed("x\n"));

    recoverInterruptedApplies(root, { applied: [], imports: { pets: { ...PETS, applyId: ID } } });

    expect(bodyOf(`${DIR}/index.ts`)).toBe("x\n");
    expect(readdirSync(join(root.path, ".courier/journal"))).toEqual([]);
  });

  it("leaves unfinished writes as they are while the imports state cannot be read, and undoes them once it can", () => {
    put(`${DIR}/index.ts`, signed("new\n"));
    put(`.courier/backups/${ID}/${DIR}/index.ts`, signed("old\n"));
    saveImportEntry(root.path, "pets", PETS, "1600000000000-0000beef");
    journalWith([{ path: `${DIR}/index.ts`, step: "write", existed: true, sha256: exactHash(signed("new\n")) }], {
      after: "1600000000000-0000beef",
    });
    const state = join(root.path, ".courier/imports-state.json");
    const saved = readFileSync(state, "utf8");
    writeFileSync(state, "<<<<<<< conflict\n");

    undoUnfinishedImportWrites(root.path);
    const during = bodyOf(`${DIR}/index.ts`);
    writeFileSync(state, saved);
    undoUnfinishedImportWrites(root.path);

    expect(during).toBe("new\n");
    expect(bodyOf(`${DIR}/index.ts`)).toBe("old\n");
  });

  it("refuses to begin an apply while the imports state cannot be read, writing nothing", () => {
    mkdirSync(join(root.path, ".courier"), { recursive: true });
    writeFileSync(join(root.path, ".courier/imports-state.json"), "<<<<<<< conflict\n");

    expect(() => applyFilePlan(root, scenario(), () => {})).toThrow(/imports-state/);
    undisturbed();
  });
});

describe("pruneBackups", () => {
  it("keeps the latest twenty applies' backups, and nothing not named like an apply is touched", () => {
    for (let n = 0; n < 25; n += 1) put(`.courier/backups/17000000000${String(n).padStart(2, "0")}-0000c0de/f.ts`, "x\n");
    put(".courier/backups/notes/keep.txt", "mine\n");

    const deleted = pruneBackups(root.path);

    const left = readdirSync(join(root.path, ".courier/backups"));
    expect(deleted).toHaveLength(5);
    expect(left).toHaveLength(21);
    expect(left).toContain("notes");
    expect(left).not.toContain("1700000000000-0000c0de");
    expect(left).toContain("1700000000024-0000c0de");
  });
});
