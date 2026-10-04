/**
 * What a Studio that still runs is writing is its own to finish or undo. A
 * second Studio started on the project — by mistake, on a port already
 * taken — leaves that write, its journal and its temporary files alone:
 * undone under it, the write would fail or leave a mix of restored and new
 * files. A start after that process is gone undoes it.
 */
import { type ChildProcess, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudioServer } from "../../src/server/create-studio-server";
import { saveJournal } from "../../src/server/import-files/apply-journal";
import { exactHash } from "../../src/server/import-files/exact-hash";
import {
  readGeneratedFile,
  signGeneratedFile,
} from "../../src/server/import-files/generated-header";
import { saveImportEntry } from "../../src/server/import-files/save-import-entry";
import type { StudioServer } from "../../src/server/types";

const DIR = "src/api/pets";
const ID = "1700000000000-0000c0de";
/* The apply that recorded the import before the one in progress began. */
const BEFORE = "1600000000000-0000beef";

let root: string;
let studio: StudioServer | undefined;
let writer: ChildProcess | undefined;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-recover-live-")));
  writeFileSync(
    join(root, "courier.config.ts"),
    'export default { sources: { api: { baseURL: "https://api.example" } } };\n',
  );
  saveImportEntry(
    root,
    "pets",
    { specHash: "h", fetchedAt: "", lastSyncedAt: "", dir: DIR, files: {} },
    BEFORE,
  );
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  writer?.kill("SIGKILL");
  writer = undefined;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function put(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function bodyOf(path: string): string {
  return readGeneratedFile(readFileSync(join(root, path), "utf8")).body;
}

function signed(body: string): string {
  return signGeneratedFile("pets", body);
}

/* Another process, standing in for the Studio making the write. */
async function liveWriter(): Promise<number> {
  writer = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  await new Promise<void>((resolve, reject) => {
    writer?.once("spawn", resolve);
    writer?.once("error", reject);
  });
  const { pid } = writer;
  if (pid === undefined) throw new Error("the writer has no pid");
  return pid;
}

async function stopWriter(): Promise<void> {
  const exited = new Promise<void>((resolve) => writer?.once("exit", () => resolve()));
  writer?.kill("SIGKILL");
  await exited;
  writer = undefined;
}

/* A write of pets halfway through its commit, made by `pid`. */
function writeInProgress(pid: number): void {
  put(`${DIR}/index.ts`, signed("new index\n"));
  put(`${DIR}/new/.courier.import.${pid}-0a1b2c3d.tmp`, signed("new group\n"));
  put(`.courier/backups/${ID}/${DIR}/index.ts`, signed("old index\n"));
  put(`.courier/.courier.state.${pid}-0a1b2c3d.tmp`, "{}");
  saveJournal(root, {
    id: ID,
    pid,
    importName: "pets",
    dir: DIR,
    after: BEFORE,
    state: "committing",
    backupDir: `.courier/backups/${ID}`,
    entries: [
      {
        path: `${DIR}/index.ts`,
        step: "write",
        existed: true,
        sha256: exactHash(signed("new index\n")),
      },
      {
        path: `${DIR}/new/index.ts`,
        step: "write",
        existed: false,
        sha256: exactHash(signed("new group\n")),
      },
    ],
    createdDirs: [`${DIR}/new`],
    temps: [`${DIR}/new/.courier.import.${pid}-0a1b2c3d.tmp`],
  });
}

function start(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({
      port: 0,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
      onError: reject,
    });
  });
}

describe("starting Studio while another process is writing an import", () => {
  it("leaves the write, its journal and its temporary files alone", async () => {
    const pid = await liveWriter();
    writeInProgress(pid);

    await start();

    expect(readdirSync(join(root, ".courier/journal"))).toEqual([`${ID}.json`]);
    expect(bodyOf(`${DIR}/index.ts`)).toBe("new index\n");
    expect(existsSync(join(root, `${DIR}/new/.courier.import.${pid}-0a1b2c3d.tmp`))).toBe(true);
    expect(existsSync(join(root, `.courier/.courier.state.${pid}-0a1b2c3d.tmp`))).toBe(true);
  });

  it("undoes the write at a start after that process is gone", async () => {
    const pid = await liveWriter();
    writeInProgress(pid);
    await stopWriter();

    await start();

    expect(readdirSync(join(root, ".courier/journal"))).toEqual([]);
    expect(bodyOf(`${DIR}/index.ts`)).toBe("old index\n");
    expect(existsSync(join(root, `${DIR}/new`))).toBe(false);
    expect(existsSync(join(root, `.courier/.courier.state.${pid}-0a1b2c3d.tmp`))).toBe(false);
  });
});
