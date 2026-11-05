/**
 * The upload folders a process looks through as it makes its first one: it
 * removes those a process of this host made and left — gone, and older than
 * the body's timeout — and leaves every other, a folder in use among them.
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

/* This host's part of a folder's name, as this process writes it. */
function host(): string {
  return folderPrefix(disk).slice("courier-upload-".length, -`-${process.pid}-`.length);
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
    const gone = gonePid();
    folder(`courier-upload-${host()}-${gone}-aB3dE9`, 10 * 60_000);
    const young = folder(`courier-upload-${host()}-${gone}-Xy7Kp2`, 60_000);

    await expect(sweepStaleUploads(disk, directory, OLDER_THAN)).resolves.toBe(1);

    expect(readdirSync(directory)).toEqual([young]);
  });

  it("stay while their process runs, on another host, in this process, or named otherwise", async () => {
    const gone = gonePid();
    const kept = [
      folder(`courier-upload-${host()}-${process.ppid}-aB3dE9`, 10 * 60_000),
      folder(`courier-upload-elsewhere-${gone}-aB3dE9`, 10 * 60_000),
      folder(`courier-upload-${host()}-${process.pid}-aB3dE9`, 10 * 60_000),
      folder("courier-upload-aB3dE9", 10 * 60_000),
      folder("another-folder", 10 * 60_000),
    ];

    await expect(sweepStaleUploads(disk, directory, OLDER_THAN)).resolves.toBe(0);

    expect(readdirSync(directory).sort()).toEqual([...kept].sort());
  });
});
