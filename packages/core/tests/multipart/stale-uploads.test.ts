/**
 * The upload folders a process looks through as it makes its first one: it
 * removes those a process of this host made and left — gone, and older than
 * the body's timeout — and leaves every other, a folder in use among them.
 * A process before it that had its number, as the server of a container
 * restarted in place has, is told apart by when it started.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type NodeDisk, nodeDisk } from "../../src/adapter/multipart/node-disk";
import { folderPrefix, sweepStaleUploads } from "../../src/adapter/multipart/stale-uploads";

const OLDER_THAN = 5 * 60_000;
let directory: string;
let disk: NodeDisk;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "courier-stale-test-"));
  const found = nodeDisk();
  if (found === undefined) throw new Error("this runtime has no disk for uploads");
  disk = found;
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

/* This host's part of a folder's name, and when this process started, as it writes them. */
function own(): { host: string; start: number } {
  const [, host = "", start] = /^courier-upload-(.+)-\d+-(\d+)-$/.exec(folderPrefix(disk)) ?? [];
  return { host, start: Number(start) };
}

/* A process that has come and gone: its number names no process now. */
function gonePid(): number {
  return spawnSync(process.execPath, ["-e", ""]).pid ?? 0;
}

/* A folder named so, as old as given. */
function folder(name: string, ageMs: number): string {
  const path = join(directory, name);
  mkdirSync(path);
  const at = new Date(Date.now() - ageMs);
  utimesSync(path, at, at);
  return name;
}

describe("the upload folders a process left", () => {
  it("are removed once their process is gone and they are older than the body's timeout", async () => {
    const { host, start } = own();
    const gone = gonePid();
    folder(`courier-upload-${host}-${gone}-${start}-aB3dE9`, 10 * 60_000);
    const young = folder(`courier-upload-${host}-${gone}-${start}-Xy7Kp2`, 60_000);

    await expect(sweepStaleUploads(disk, directory, OLDER_THAN)).resolves.toBe(1);

    expect(readdirSync(directory)).toEqual([young]);
  });

  it("are removed when a process before this one had its number, and started at another moment", async () => {
    const { host, start } = own();
    folder(`courier-upload-${host}-${process.pid}-${start + 3_600_000}-aB3dE9`, 10 * 60_000);
    const young = folder(
      `courier-upload-${host}-${process.pid}-${start + 3_600_000}-Xy7Kp2`,
      60_000,
    );

    await expect(sweepStaleUploads(disk, directory, OLDER_THAN)).resolves.toBe(1);

    expect(readdirSync(directory)).toEqual([young]);
  });

  it("stay while their process runs, on another host, in this process, or named otherwise", async () => {
    const { host, start } = own();
    const gone = gonePid();
    const kept = [
      folder(`courier-upload-${host}-${process.ppid}-${start}-aB3dE9`, 10 * 60_000),
      folder(`courier-upload-elsewhere-${gone}-${start}-aB3dE9`, 10 * 60_000),
      folder(`courier-upload-${host}-${process.pid}-${start}-aB3dE9`, 10 * 60_000),
      /* Another thread of this process, or another copy of the package in it, read its start so. */
      folder(`courier-upload-${host}-${process.pid}-${start + 400}-Qw8Rt5`, 10 * 60_000),
      folder("courier-upload-aB3dE9", 10 * 60_000),
      folder("another-folder", 10 * 60_000),
    ];

    await expect(sweepStaleUploads(disk, directory, OLDER_THAN)).resolves.toBe(0);

    expect(readdirSync(directory).sort()).toEqual([...kept].sort());
  });
});
