/**
 * `.courier/` can arrive with a project — committed by mistake, or on
 * purpose — so what Studio finds there is read as untrusted: a journal it
 * did not write for an apply it made acts on nothing outside that apply's
 * import folder and its own backup, and nothing Studio keeps there is
 * written, pruned or read through a symbolic link.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyFilePlan } from "../../src/server/import-files/apply-file-plan";
import { bodyHash } from "../../src/server/import-files/body-hash";
import { planFiles } from "../../src/server/import-files/plan-files";
import { recoverInterruptedApplies } from "../../src/server/import-files/recover-interrupted-applies";
import { type ProjectRoot, projectRootAt } from "../../src/server/project-fs/project-root";

const IS_WINDOWS = process.platform === "win32";
const DIR = "src/api/pets";

let scratch: string;
let root: ProjectRoot;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "courier-untrusted-")));
  mkdirSync(join(scratch, "proj"));
  root = projectRootAt(join(scratch, "proj"));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(scratch, { recursive: true, force: true });
});

function put(path: string, content: string): void {
  mkdirSync(dirname(join(root.path, path)), { recursive: true });
  writeFileSync(join(root.path, path), content);
}

function journal(name: string, content: unknown): void {
  put(`.courier/journal/${name}`, JSON.stringify(content));
}

const ID = "1700000000000-0a1b2c3d";

function planted(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    id: ID,
    pid: process.pid,
    importName: "pets",
    dir: DIR,
    after: null,
    state: "committing",
    backupDir: `.courier/backups/${ID}`,
    entries: [],
    createdDirs: [],
    temps: [],
    ...extra,
  };
}

describe("startup recovery with journals Studio did not write", () => {
  it("deletes no file a journal names as a temporary file unless it is one of Studio's beside the import", () => {
    put("package.json", "{}\n");
    put(`${DIR}/helpers.ts`, "mine\n");
    journal(`${ID}.json`, planted({ temps: ["package.json", `${DIR}/helpers.ts`] }));

    recoverInterruptedApplies(root, { applied: [], imports: {} });

    expect(readFileSync(join(root.path, "package.json"), "utf8")).toBe("{}\n");
    expect(readFileSync(join(root.path, `${DIR}/helpers.ts`), "utf8")).toBe("mine\n");
  });

  it("deletes nothing outside the project that a journal names", () => {
    writeFileSync(join(scratch, "outside.txt"), "outside\n");
    journal(`${ID}.json`, planted({ temps: ["../outside.txt"], createdDirs: [".."] }));

    recoverInterruptedApplies(root, { applied: [], imports: {} });

    expect(readFileSync(join(scratch, "outside.txt"), "utf8")).toBe("outside\n");
  });

  it("moves nothing from a folder a journal calls its backup unless it is that apply's own", () => {
    put("lib/src/app.ts", "the user's lib\n");
    journal(`${ID}.json`, planted({ backupDir: "lib", entries: [{ path: "src/app.ts", step: "remove", existed: true }] }));

    recoverInterruptedApplies(root, { applied: [], imports: {} });

    expect(readFileSync(join(root.path, "lib/src/app.ts"), "utf8")).toBe("the user's lib\n");
    expect(existsSync(join(root.path, "src/app.ts"))).toBe(false);
  });

  it("touches no file outside the import's folder", () => {
    put("src/app.ts", "written\n");
    const entries = [{ path: "src/app.ts", step: "write", existed: false, sha256: bodyHash("written\n") }];
    journal(`${ID}.json`, planted({ entries }));

    recoverInterruptedApplies(root, { applied: [], imports: {} });

    expect(readFileSync(join(root.path, "src/app.ts"), "utf8")).toBe("written\n");
  });

  it("acts on no journal whose id is not its file name, and deletes nothing it names", () => {
    put(".courier/keep.json", "{}\n");
    journal("1700000000000-ffffffff.json", planted({ id: "../keep" }));

    recoverInterruptedApplies(root, { applied: [], imports: {} });

    expect(existsSync(join(root.path, ".courier/keep.json"))).toBe(true);
    expect(readdirSync(join(root.path, ".courier/journal"))).toEqual(["1700000000000-ffffffff.json"]);
  });
});

describe.skipIf(IS_WINDOWS)("a .courier folder that is a symbolic link", () => {
  function scenario() {
    put(`${DIR}/index.ts`, "old\n");
    return planFiles(
      root,
      { importName: "pets", dir: DIR, targets: [{ path: `${DIR}/index.ts`, body: "new\n", kind: "generated", endpoints: {} }], removals: [] },
      { [`${DIR}/index.ts`]: { sha256: bodyHash("old\n") } },
    );
  }

  it("prunes nothing through a backups folder that links outside the project", async () => {
    const outside = join(scratch, "outside");
    for (let n = 0; n < 25; n += 1) mkdirSync(join(outside, `1600000000${String(n).padStart(3, "0")}-00000000`), { recursive: true });
    mkdirSync(join(root.path, ".courier"), { recursive: true });
    symlinkSync(outside, join(root.path, ".courier/backups"), "dir");
    /* Only a new file: nothing is backed up, so the apply reaches the pruning. */
    const plan = planFiles(
      root,
      { importName: "pets", dir: DIR, targets: [{ path: `${DIR}/new.ts`, body: "new\n", kind: "generated", endpoints: {} }], removals: [] },
      {},
    );

    try {
      await applyFilePlan(root, plan, () => {});
    } catch {
      /* Refusing the apply is as good as pruning nothing: what counts is the folder outside. */
    }

    expect(readdirSync(outside)).toHaveLength(25);
  });

  it("writes no journal through a .courier that links outside the project", async () => {
    const outside = join(scratch, "outside-courier");
    mkdirSync(outside);
    symlinkSync(outside, join(root.path, ".courier"), "dir");

    await expect(applyFilePlan(root, scenario(), () => {})).rejects.toThrow();

    expect(readdirSync(outside)).toEqual([]);
    expect(readFileSync(join(root.path, `${DIR}/index.ts`), "utf8")).toBe("old\n");
  });
});
