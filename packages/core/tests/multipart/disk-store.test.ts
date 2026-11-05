/**
 * An upload's files kept in memory up to the upload's share, and on disk
 * past it: in a folder of its own, this user's alone, removed once let go.
 */
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BodyError } from "../../src/adapter/body-error";
import { diskStore } from "../../src/adapter/multipart/disk-store";
import type { MultipartPart } from "../../src/adapter/multipart/multipart-parts";
import { type NodeDisk, nodeDisk } from "../../src/adapter/multipart/node-disk";
import { chunked } from "../helpers/multipart-fixtures";

const disk = nodeDisk() as NodeDisk;
let parent: string;

beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), "courier-disk-store-test-"));
});

afterEach(() => {
  rmSync(parent, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const store = (memoryBytes: number, on: NodeDisk = disk) =>
  diskStore({ disk: on, directory: parent, memoryBytes, slabBytes: 16 });

/** A file part of `size` bytes, arriving in chunks of 7. */
function part(size: number, name = "a.bin"): MultipartPart {
  const bytes = new Uint8Array(size).map((_, at) => at % 251);
  const cuts = Array.from({ length: Math.ceil(size / 7) }, (_, at) => at * 7);
  return {
    name: "f",
    filename: name,
    type: "application/octet-stream",
    body: chunked(bytes, cuts).stream,
  };
}

const folders = (): string[] => readdirSync(parent);

describe("diskStore", () => {
  it("keeps a file within the upload's share in memory, and makes no folder", async () => {
    const files = store(100);

    const file = await files.file(part(60));

    expect(file.size).toBe(60);
    expect(folders()).toEqual([]);
  });

  it("writes a file past the share to disk, and hands it back whole", async () => {
    const files = store(100);

    const file = await files.file(part(1000, "big.bin"));

    expect([file.name, file.type, file.size]).toEqual([
      "big.bin",
      "application/octet-stream",
      1000,
    ]);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(
      new Uint8Array(1000).map((_, at) => at % 251),
    );
    expect(folders()).toHaveLength(1);
  });

  it.skipIf(process.platform === "win32")(
    "keeps the folder and its files for this user alone",
    async () => {
      await store(0).file(part(10));

      const [folder = ""] = folders();
      expect(statSync(join(parent, folder)).mode & 0o777).toBe(0o700);
      expect(statSync(join(parent, folder, "0")).mode & 0o777).toBe(0o600);
    },
  );

  it("holds the whole upload to its share: the file that runs past it goes to disk", async () => {
    const files = store(100);

    const first = await files.file(part(60));
    const second = await files.file(part(60));

    expect([first.size, second.size]).toEqual([60, 60]);
    expect(readdirSync(join(parent, folders()[0] ?? ""))).toEqual(["0"]);
  });

  it("removes the folder as it lets go, after which a file on disk cannot be read", async () => {
    const files = store(0);
    const file = await files.file(part(100));

    await files.release();

    expect(folders()).toEqual([]);
    await expect(file.arrayBuffer()).rejects.toThrow();
  });

  it("keeps the upload in memory, telling it once, where no folder can be made", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeFileSync(join(parent, "not-a-folder"), "");
    const files = diskStore({
      disk,
      directory: join(parent, "not-a-folder"),
      memoryBytes: 0,
      slabBytes: 16,
    });

    const first = await files.file(part(500));
    await files.file(part(500));

    expect(first.size).toBe(500);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.join(" "))).toContain("uploadDirectory");
  });

  it("refuses the upload with 507 when the disk is full, its file closed", async () => {
    let closed = false;
    const full = Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
    const fullDisk: NodeDisk = {
      ...disk,
      fs: {
        ...disk.fs,
        promises: {
          ...disk.fs.promises,
          open: async () =>
            ({
              write: async () => {
                throw full;
              },
              close: async () => {
                closed = true;
              },
            }) as unknown as Awaited<ReturnType<typeof disk.fs.promises.open>>,
        },
      },
    };

    const error: unknown = await store(0, fullDisk)
      .file(part(100))
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BodyError);
    expect(error).toMatchObject({ code: "UPLOAD_STORAGE_FULL", status: 507 });
    expect(closed).toBe(true);
  });

  it("removes a folder whose file is still being read, as Windows lets it once the reader is done", async () => {
    const files = store(0);
    const file = await files.file(part(5000));
    const reader = file.stream().getReader();
    await reader.read();

    await files.release();
    await reader.cancel();

    await expect.poll(folders).toEqual([]);
  });
});
