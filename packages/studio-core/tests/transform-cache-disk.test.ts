/**
 * @vitest-environment node
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import type * as FsModule from "node:fs";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  futimesSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Worker } from "node:worker_threads";
import type { TransformOptions, TransformResult } from "jiti";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTransformCache } from "../src/runtime/transform-cache";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof FsModule>();
  return {
    ...actual,
    futimesSync: vi.fn(actual.futimesSync),
    renameSync: vi.fn(actual.renameSync),
    writeFileSync: vi.fn(actual.writeFileSync),
  };
});

const CONFIG = "/project/courier.config.ts";
const SOURCES = "/project/sources.ts";
const DAY_MS = 24 * 60 * 60 * 1000;
const POSIX = process.platform !== "win32";
const PLATFORM = Object.getOwnPropertyDescriptor(process, "platform");

/* Run in a worker while the test reads a FIFO put in place of an entry. If
   the reader has not finished within the grace, it is stuck opening the
   FIFO; opening the write end lets it through, and the worker says so. */
const FIFO_RESCUE = `
const { workerData } = require("node:worker_threads");
const { closeSync, constants, lstatSync, openSync } = require("node:fs");
const state = new Int32Array(workerData.state);
const outcome = Atomics.wait(state, 0, 0, workerData.graceMs);
if (outcome === "timed-out" && lstatSync(workerData.fifo).isFIFO()) {
  closeSync(openSync(workerData.fifo, constants.O_WRONLY | constants.O_NONBLOCK));
  Atomics.store(state, 1, 1);
}
`;

let dir: string;
let directory: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-transform-disk-")));
  directory = join(dir, "transform");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(futimesSync).mockReset();
  vi.mocked(renameSync).mockReset();
  vi.mocked(writeFileSync).mockReset();
  if (PLATFORM !== undefined) Object.defineProperty(process, "platform", PLATFORM);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

function optionsFor(overrides: Partial<TransformOptions> = {}): TransformOptions {
  return {
    filename: CONFIG,
    source: "export default { sources: {} };",
    ts: true,
    async: true,
    interopDefault: true,
    ...overrides,
  };
}

/** Compiles by tagging the source, so a result names the input that made it. */
function compiler() {
  return vi.fn(
    (options: TransformOptions): TransformResult => ({ code: `compiled:${options.source}` }),
  );
}

function listing(): string[] {
  return existsSync(directory) ? readdirSync(directory).sort() : [];
}

/** Where the entry for `options` is kept: named after the sha256 of its module system and file. */
function entryOf({ filename, async }: TransformOptions): string {
  const key = `${async === true}\0${filename}`;
  return join(directory, `${createHash("sha256").update(key).digest("hex").slice(0, 40)}.js`);
}

/** A time ten days ago, whole seconds, so every file system keeps it exactly. */
function tenDaysAgo(): Date {
  return new Date(Math.floor((Date.now() - 10 * DAY_MS) / 1000) * 1000);
}

function silenceWarnings() {
  return vi.spyOn(console, "warn").mockImplementation(() => {});
}

function errnoError(code: string): Error {
  return Object.assign(new Error(`${code}: refused`), { code });
}

describe("createTransformCache with a directory", () => {
  it("a second cache on the same directory transforms nothing, and hands back the same code", () => {
    const compute = compiler();

    const written = createTransformCache({ directory }).transform(optionsFor(), compute);
    const read = createTransformCache({ directory }).transform(optionsFor(), compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(read).toEqual(written);
  });

  it("keeps a required and an imported transform of one file apart", () => {
    const compute = compiler();
    const writer = createTransformCache({ directory });
    writer.transform(optionsFor({ async: false }), compute);
    writer.transform(optionsFor({ async: true }), compute);

    const reader = createTransformCache({ directory });
    reader.transform(optionsFor({ async: false }), compute);
    reader.transform(optionsFor({ async: true }), compute);

    expect(compute).toHaveBeenCalledTimes(2);
    expect(listing().filter((name) => name.endsWith(".js"))).toHaveLength(2);
  });

  it("leaves nothing in the directory but the entry after a successful write", () => {
    createTransformCache({ directory }).transform(optionsFor(), compiler());

    expect(listing()).toEqual([basename(entryOf(optionsFor()))]);
  });

  it.skipIf(!POSIX)(
    "creates the directory for this user alone, and each entry readable by this user alone",
    () => {
      createTransformCache({ directory }).transform(optionsFor(), compiler());

      expect(statSync(directory).mode & 0o777).toBe(0o700);
      expect(listing()).toEqual([basename(entryOf(optionsFor()))]);
      expect(statSync(entryOf(optionsFor())).mode & 0o777).toBe(0o600);
    },
  );

  it("ignores an entry whose header names another digest, and replaces it", () => {
    const compute = compiler();
    createTransformCache({ directory }).transform(
      optionsFor({ source: "export const a = 1;" }),
      compute,
    );

    const edited = createTransformCache({ directory }).transform(
      optionsFor({ source: "export const b = 2;" }),
      compute,
    );
    const reread = createTransformCache({ directory }).transform(
      optionsFor({ source: "export const b = 2;" }),
      compute,
    );

    expect(compute).toHaveBeenCalledTimes(2);
    expect(edited).toEqual({ code: "compiled:export const b = 2;" });
    expect(reread).toEqual(edited);
  });

  it.each<[string, (entry: string) => void]>([
    ["truncated", (entry) => truncateSync(entry, statSync(entry).size - 4)],
    ["extended", (entry) => writeFileSync(entry, "\nthrow 1;", { flag: "a" })],
    [
      "altered at the same length",
      (entry) => {
        const bytes = readFileSync(entry);
        bytes[bytes.length - 2] = 0x78;
        writeFileSync(entry, bytes);
      },
    ],
  ])(
    "ignores an entry whose body was %s after its header was written, and overwrites it",
    (_how, damage) => {
      const compute = compiler();
      createTransformCache({ directory }).transform(optionsFor(), compute);
      damage(entryOf(optionsFor()));

      const recomputed = createTransformCache({ directory }).transform(optionsFor(), compute);
      const reread = createTransformCache({ directory }).transform(optionsFor(), compute);

      expect(compute).toHaveBeenCalledTimes(2);
      expect(recomputed).toEqual({ code: `compiled:${optionsFor().source}` });
      expect(reread).toEqual(recomputed);
    },
  );

  it("never writes a failed transform, and writes the success that follows it", () => {
    const failure: TransformResult = {
      code: "exports.__JITI_ERROR__ = {}",
      error: new SyntaxError("Unexpected token"),
    };
    const failing = vi.fn((_options: TransformOptions) => failure);
    const compute = compiler();

    const failed = createTransformCache({ directory }).transform(optionsFor(), failing);
    const afterFailure = listing();
    createTransformCache({ directory }).transform(optionsFor(), compute);
    createTransformCache({ directory }).transform(optionsFor(), compute);

    expect(failed).toBe(failure);
    expect(afterFailure).toEqual([]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("keeps code that UTF-8 cannot carry in memory only, and writes the rest", () => {
    const compute = vi.fn(
      (options: TransformOptions): TransformResult => ({ code: options.source }),
    );
    const loneSurrogate = optionsFor({ source: "export const s = '\uD800';" });
    const plain = optionsFor({ filename: SOURCES, source: "export const s = 's';" });
    const writer = createTransformCache({ directory });
    writer.transform(loneSurrogate, compute);
    writer.transform(plain, compute);

    const reader = createTransformCache({ directory });
    const recomputed = reader.transform(loneSurrogate, compute);
    reader.transform(plain, compute);

    expect(compute.mock.calls.map(([options]) => options.filename)).toEqual([
      CONFIG,
      SOURCES,
      CONFIG,
    ]);
    expect(recomputed).toEqual({ code: loneSurrogate.source });
  });

  it.skipIf(!POSIX)(
    "ignores an entry that is a symbolic link without a warning, and replaces the link rather than what it leads to",
    () => {
      const warn = silenceWarnings();
      const compute = compiler();
      createTransformCache({ directory }).transform(optionsFor(), compute);
      const entry = entryOf(optionsFor());
      const target = join(dir, "planted.js");
      copyFileSync(entry, target);
      rmSync(entry);
      symlinkSync(target, entry);
      const planted = readFileSync(target);

      createTransformCache({ directory }).transform(optionsFor(), compute);
      createTransformCache({ directory }).transform(optionsFor(), compute);

      expect(compute).toHaveBeenCalledTimes(2);
      expect(lstatSync(entry).isSymbolicLink()).toBe(false);
      expect(readFileSync(target)).toEqual(planted);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it.skipIf(!POSIX)(
    "ignores a FIFO put in place of an entry at once, rather than waiting for a writer",
    async () => {
      const compute = compiler();
      createTransformCache({ directory }).transform(optionsFor(), compute);
      const entry = entryOf(optionsFor());
      rmSync(entry);
      execFileSync("mkfifo", ["-m", "600", entry]);
      const state = new Int32Array(new SharedArrayBuffer(8));
      const rescuer = new Worker(FIFO_RESCUE, {
        eval: true,
        workerData: { state: state.buffer, fifo: entry, graceMs: 2000 },
      });
      const exited = once(rescuer, "exit");

      createTransformCache({ directory }).transform(optionsFor(), compute);
      Atomics.store(state, 0, 1);
      Atomics.notify(state, 0);
      await exited;

      expect(Atomics.load(state, 1)).toBe(0);
      expect(compute).toHaveBeenCalledTimes(2);
      expect(lstatSync(entry).isFile()).toBe(true);
    },
  );

  it.skipIf(!POSIX)("ignores an entry its group or others can write, and replaces it", () => {
    const compute = compiler();
    createTransformCache({ directory }).transform(optionsFor(), compute);
    chmodSync(entryOf(optionsFor()), 0o664);

    createTransformCache({ directory }).transform(optionsFor(), compute);
    createTransformCache({ directory }).transform(optionsFor(), compute);

    expect(compute).toHaveBeenCalledTimes(2);
    expect(listing()).toEqual([basename(entryOf(optionsFor()))]);
    expect(statSync(entryOf(optionsFor())).mode & 0o777).toBe(0o600);
  });

  it.skipIf(!POSIX)(
    "ignores an entry owned by another user, and writes nothing into their directory",
    () => {
      const warn = silenceWarnings();
      const compute = compiler();
      const uid = process.getuid?.() ?? 0;
      createTransformCache({ directory }).transform(optionsFor(), compute);
      const written = statSync(entryOf(optionsFor())).ino;

      const getuid = vi.spyOn(process, "getuid").mockReturnValue(uid + 1);
      createTransformCache({ directory }).transform(optionsFor(), compute);
      getuid.mockRestore();

      expect(compute).toHaveBeenCalledTimes(2);
      expect(statSync(entryOf(optionsFor())).ino).toBe(written);
      expect(String(warn.mock.calls[0]?.[1])).toContain(
        `${directory} is owned by uid ${uid}, not ${uid + 1}`,
      );
    },
  );

  it("keeps an entry read from the directory in memory, so the next load of it reads nothing", () => {
    const compute = compiler();
    createTransformCache({ directory }).transform(optionsFor(), compute);
    const reader = createTransformCache({ directory });
    const read = reader.transform(optionsFor(), compute);
    rmSync(entryOf(optionsFor()));

    const again = reader.transform(optionsFor(), compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(again).toEqual(read);
  });

  it("touches an entry on its first hit in a process, and not on later ones", () => {
    const compute = compiler();
    createTransformCache({ directory }).transform(optionsFor(), compute);
    const entry = entryOf(optionsFor());
    const old = tenDaysAgo();
    utimesSync(entry, old, old);
    const reader = createTransformCache({ directory, maxMemoryChars: 0 });

    reader.transform(optionsFor(), compute);
    const touchedAt = statSync(entry).mtimeMs;
    utimesSync(entry, old, old);
    reader.transform(optionsFor(), compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(touchedAt).toBeGreaterThan(Date.now() - 60_000);
    expect(statSync(entry).mtimeMs).toBe(old.getTime());
  });

  it("touches an entry once per process, however many caches read it", () => {
    const compute = compiler();
    createTransformCache({ directory }).transform(optionsFor(), compute);
    createTransformCache({ directory }).transform(optionsFor(), compute);
    const entry = entryOf(optionsFor());
    const old = tenDaysAgo();
    utimesSync(entry, old, old);

    createTransformCache({ directory }).transform(optionsFor(), compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(statSync(entry).mtimeMs).toBe(old.getTime());
  });

  it("touches an entry through its name on Windows, where a descriptor opened to read cannot change its times", () => {
    const compute = compiler();
    createTransformCache({ directory }).transform(optionsFor(), compute);
    const entry = entryOf(optionsFor());
    const old = tenDaysAgo();
    utimesSync(entry, old, old);
    vi.mocked(futimesSync).mockImplementation(() => {
      throw errnoError("EPERM");
    });
    Object.defineProperty(process, "platform", { ...PLATFORM, value: "win32" });

    createTransformCache({ directory }).transform(optionsFor(), compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(statSync(entry).mtimeMs).toBeGreaterThan(Date.now() - 60_000);
  });

  it("creates the directory again when it is removed while the process runs, and goes on writing", () => {
    const warn = silenceWarnings();
    const compute = compiler();
    const cacheRoot = join(dir, "cache");
    directory = join(cacheRoot, "courier", "transform");
    const cache = createTransformCache({ directory });
    cache.transform(optionsFor(), compute);
    rmSync(cacheRoot, { recursive: true });

    cache.transform(optionsFor({ filename: SOURCES }), compute);
    createTransformCache({ directory }).transform(optionsFor({ filename: SOURCES }), compute);

    expect(compute.mock.calls.map(([options]) => options.filename)).toEqual([CONFIG, SOURCES]);
    expect(listing()).toEqual([basename(entryOf(optionsFor({ filename: SOURCES })))]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("createTransformCache reading a directory only", () => {
  it("hands back what another cache kept, and keeps a transform it had to compute out of the directory", () => {
    const compute = compiler();
    const kept = createTransformCache({ directory }).transform(optionsFor(), compute);
    const before = listing();
    const reader = createTransformCache({ directory, readOnly: true });

    const read = reader.transform(optionsFor(), compute);
    reader.transform(optionsFor({ filename: SOURCES }), compute);

    expect(compute.mock.calls.map(([options]) => options.filename)).toEqual([CONFIG, SOURCES]);
    expect(read).toEqual(kept);
    expect(listing()).toEqual(before);
  });

  it("leaves the time of an entry it reads as it was", () => {
    const compute = compiler();
    createTransformCache({ directory }).transform(optionsFor(), compute);
    const entry = entryOf(optionsFor());
    const old = tenDaysAgo();
    utimesSync(entry, old, old);

    createTransformCache({ directory, readOnly: true }).transform(optionsFor(), compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(futimesSync).not.toHaveBeenCalled();
    expect(statSync(entry).mtimeMs).toBe(old.getTime());
  });

  it("creates no directory that does not exist yet", () => {
    const compute = compiler();

    createTransformCache({ directory, readOnly: true }).transform(optionsFor(), compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(existsSync(directory)).toBe(false);
  });

  it("prunes nothing, however old the entries it finds", () => {
    const compute = compiler();
    const elsewhere = join(dir, "elsewhere");
    createTransformCache({ directory: elsewhere }).transform(optionsFor(), compute);
    mkdirSync(directory, { mode: 0o700 });
    const stale = entryOf(optionsFor());
    copyFileSync(join(elsewhere, basename(stale)), stale);
    const longAgo = new Date(Date.now() - 60 * DAY_MS);
    utimesSync(stale, longAgo, longAgo);

    createTransformCache({ directory, readOnly: true }).transform(
      optionsFor({ filename: SOURCES }),
      compute,
    );

    expect(compute).toHaveBeenCalledTimes(2);
    expect(listing()).toEqual([basename(stale)]);
  });
});

describe("createTransformCache with a directory it cannot use", () => {
  it("keeps transforming and warns once when the directory cannot be created, since its path is a file", () => {
    const warn = silenceWarnings();
    const blocked = join(dir, "blocked");
    writeFileSync(blocked, "");
    const compute = compiler();
    const cache = createTransformCache({ directory: blocked });

    const config = cache.transform(optionsFor(), compute);
    const sources = cache.transform(optionsFor({ filename: SOURCES }), compute);

    expect(config).toEqual({ code: `compiled:${optionsFor().source}` });
    expect(sources).toEqual({ code: `compiled:${optionsFor().source}` });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[1])).toMatch(
      new RegExp(`cannot write to ${blocked} \\((EEXIST|ENOTDIR)\\)`),
    );
  });

  it.skipIf(!POSIX)(
    "writes nothing through a directory that is already a symbolic link, and says why once",
    () => {
      const warn = silenceWarnings();
      const elsewhere = join(dir, "elsewhere");
      mkdirSync(elsewhere, { mode: 0o700 });
      symlinkSync(elsewhere, directory);
      const compute = compiler();
      const cache = createTransformCache({ directory });

      cache.transform(optionsFor(), compute);
      cache.transform(optionsFor({ filename: SOURCES }), compute);

      expect(readdirSync(elsewhere)).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[1])).toContain(`${directory} is a symbolic link`);
    },
  );

  it.skipIf(!POSIX)(
    "writes nothing into a directory that already exists writable by its group, and says why once",
    () => {
      const warn = silenceWarnings();
      mkdirSync(directory);
      chmodSync(directory, 0o770);
      const compute = compiler();
      const cache = createTransformCache({ directory });

      cache.transform(optionsFor(), compute);
      cache.transform(optionsFor({ filename: SOURCES }), compute);

      expect(listing()).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[1])).toContain(
        `${directory} is writable by its group or others`,
      );
    },
  );

  it("leaves no temporary file after a failed rename, warns once, and writes nothing more", () => {
    const warn = silenceWarnings();
    const compute = compiler();
    createTransformCache({ directory }).transform(
      optionsFor({ source: "export const a = 1;" }),
      compute,
    );
    const entry = entryOf(optionsFor());
    rmSync(entry);
    mkdirSync(entry);
    writeFileSync(join(entry, "occupant"), "");
    const cache = createTransformCache({ directory });

    const edited = cache.transform(optionsFor({ source: "export const b = 2;" }), compute);
    cache.transform(optionsFor({ filename: SOURCES }), compute);

    expect(edited).toEqual({ code: "compiled:export const b = 2;" });
    expect(listing()).toEqual([basename(entry)]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[1])).toContain(`cannot write to ${directory}`);
  });

  it("leaves no temporary file when writing it fails, as on a full disk, and warns once", () => {
    const warn = silenceWarnings();
    vi.mocked(writeFileSync).mockImplementationOnce(() => {
      throw errnoError("ENOSPC");
    });

    const result = createTransformCache({ directory }).transform(optionsFor(), compiler());

    expect(result).toEqual({ code: `compiled:${optionsFor().source}` });
    expect(listing()).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[1])).toContain(`cannot write to ${directory} (ENOSPC)`);
  });

  it.each(["EPERM", "EBUSY", "EACCES"])(
    "skips one write when the rename fails with %s, and keeps writing afterwards",
    (code) => {
      const warn = silenceWarnings();
      const compute = compiler();
      vi.mocked(renameSync).mockImplementationOnce(() => {
        throw errnoError(code);
      });
      const writer = createTransformCache({ directory });
      writer.transform(optionsFor(), compute);
      writer.transform(optionsFor({ filename: SOURCES }), compute);

      const reader = createTransformCache({ directory });
      reader.transform(optionsFor(), compute);
      reader.transform(optionsFor({ filename: SOURCES }), compute);

      expect(compute.mock.calls.map(([options]) => options.filename)).toEqual([
        CONFIG,
        SOURCES,
        CONFIG,
      ]);
      expect(listing().filter((name) => name.endsWith(".tmp"))).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it.skipIf(!POSIX || process.getuid?.() === 0)(
    "warns once when entries cannot be read, transforms them, and replaces them",
    () => {
      const warn = silenceWarnings();
      const compute = compiler();
      const writer = createTransformCache({ directory });
      writer.transform(optionsFor(), compute);
      writer.transform(optionsFor({ filename: SOURCES }), compute);
      for (const name of listing()) chmodSync(join(directory, name), 0o000);

      const blocked = createTransformCache({ directory });
      blocked.transform(optionsFor(), compute);
      blocked.transform(optionsFor({ filename: SOURCES }), compute);
      const reader = createTransformCache({ directory });
      reader.transform(optionsFor(), compute);
      reader.transform(optionsFor({ filename: SOURCES }), compute);

      expect(compute).toHaveBeenCalledTimes(4);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[1])).toContain(
        `cannot read entries in ${directory} (EACCES)`,
      );
    },
  );
});
