import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as FileSignatureModule from "../src/server/file-signature";

/* Counts how many times a file is signed, which hashes its bytes. */
const signing = vi.hoisted(() => ({ count: 0 }));

vi.mock("../src/server/file-signature", async (importOriginal) => {
  const actual = await importOriginal<typeof FileSignatureModule>();
  return {
    ...actual,
    signatureOf: (path: string) => {
      signing.count += 1;
      return actual.signatureOf(path);
    },
  };
});

import { createWatchSet, type WatchSet } from "../src/server/watch-set";

/**
 * Each test gets its own directory: the filesystem reports the fixture's own
 * creation with a delay of its own, and in a reused directory those late
 * notifications are indistinguishable from the change under test.
 */
let root: string;
let sets: WatchSet[];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
/** Long enough for a native notification, short enough to keep the suite quick. */
const SETTLE_MS = 250;
/** A deadline for a sweep that no save in the test outlasts. */
const soon = () => Date.now() + 5_000;

/** Collects every path the set reports, so a test can await a specific one. */
function collector() {
  const seen: string[] = [];
  return {
    onChange: (changed: string[]) => seen.push(...changed),
    seen,
    async waitFor(path: string, budgetMs = 3000): Promise<boolean> {
      for (let waited = 0; waited < budgetMs; waited += 50) {
        if (seen.includes(path)) return true;
        await sleep(50);
      }
      return false;
    },
  };
}

function start(options: Parameters<typeof createWatchSet>[0]): WatchSet {
  const set = createWatchSet(options);
  sets.push(set);
  return set;
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "courier-watch-"));
  sets = [];
  await sleep(SETTLE_MS);
});

afterEach(() => {
  for (const set of sets) set.stop();
  rmSync(root, { recursive: true, force: true });
});

describe("createWatchSet", () => {
  it("reports nothing for a tracked file that does not exist yet", async () => {
    /* Studio started before its config existed watches every name the config
       may take, and reported each of them as changed as soon as it started. */
    const missing = join(root, "courier.config.ts");
    const c = collector();
    start({ paths: [missing], onChange: c.onChange, debounceMs: 20 });

    await sleep(SETTLE_MS * 4);

    expect(c.seen).toEqual([]);
  });

  it("reports a tracked file once it is created", async () => {
    const created = join(root, "courier.config.ts");
    const c = collector();
    start({ paths: [created], onChange: c.onChange, debounceMs: 20 });
    await sleep(SETTLE_MS);

    writeFileSync(created, "export default {}");

    expect(await c.waitFor(created)).toBe(true);
  });

  it("reports a change to a tracked file", async () => {
    const file = join(root, "a.ts");
    writeFileSync(file, "1");
    const c = collector();
    start({ paths: [file], onChange: c.onChange });
    await sleep(SETTLE_MS);

    writeFileSync(file, "2");

    expect(await c.waitFor(file)).toBe(true);
  });

  it("reports a same-size edit saved within the same timestamp tick", async () => {
    const file = join(root, "a.ts");
    const tick = new Date("2026-01-01T00:00:00Z");
    writeFileSync(file, 'export const a = "one"');
    utimesSync(file, tick, tick);
    const c = collector();
    start({ paths: [file], onChange: c.onChange });
    await sleep(SETTLE_MS);

    writeFileSync(file, 'export const a = "two"');
    utimesSync(file, tick, tick);
    expect(await c.waitFor(file)).toBe(true);
    c.seen.length = 0;

    /* Coarse filesystems give both saves one timestamp; the length did not
       change either, so only the content tells this save from the last. */
    writeFileSync(file, 'export const a = "six"');
    utimesSync(file, tick, tick);

    expect(await c.waitFor(file)).toBe(true);
  });

  it("keeps reporting after an atomic save replaces the file", async () => {
    const file = join(root, "a.ts");
    writeFileSync(file, "1");
    const c = collector();
    start({ paths: [file], onChange: c.onChange });
    await sleep(SETTLE_MS);

    writeFileSync(join(root, "a.tmp"), "2");
    renameSync(join(root, "a.tmp"), file);
    expect(await c.waitFor(file)).toBe(true);

    c.seen.length = 0;
    await sleep(SETTLE_MS);
    writeFileSync(file, "3");

    expect(await c.waitFor(file)).toBe(true);
  });

  it("reports a deletion and the re-creation that follows it", async () => {
    const file = join(root, "a.ts");
    writeFileSync(file, "1");
    const c = collector();
    start({ paths: [file], onChange: c.onChange });
    await sleep(SETTLE_MS);

    unlinkSync(file);
    expect(await c.waitFor(file)).toBe(true);

    c.seen.length = 0;
    await sleep(SETTLE_MS);
    writeFileSync(file, "2");

    expect(await c.waitFor(file)).toBe(true);
  });

  it("watches a path added by update()", async () => {
    const first = join(root, "a.ts");
    const second = join(root, "b.ts");
    writeFileSync(first, "1");
    writeFileSync(second, "1");
    const c = collector();
    const set = start({ paths: [first], onChange: c.onChange });
    await sleep(SETTLE_MS);

    set.update([first, second]);
    await sleep(SETTLE_MS);
    writeFileSync(second, "2");

    expect(await c.waitFor(second)).toBe(true);
  });

  it("tells a save of a linked file once, though the link and its target are both watched", async () => {
    /* The target's directory tells of a save at once, the link's poll up to
       half a second later. */
    const target = join(root, "courier.config.ts");
    const link = join(root, "linked.config.ts");
    writeFileSync(target, "1");
    symlinkSync(target, link);
    const reports: string[][] = [];
    start({ paths: [link, target], onChange: (changed) => reports.push(changed), debounceMs: 20 });
    await sleep(SETTLE_MS);

    writeFileSync(target, "2");
    await sleep(1_200);

    expect(reports).toHaveLength(1);
  });

  it("stops reporting a path that update() dropped", async () => {
    const first = join(root, "a.ts");
    const second = join(root, "b.ts");
    writeFileSync(first, "1");
    writeFileSync(second, "1");
    const c = collector();
    const set = start({ paths: [first, second], onChange: c.onChange });
    await sleep(SETTLE_MS);
    c.seen.length = 0;

    set.update([first]);
    await sleep(SETTLE_MS);
    writeFileSync(second, "2");
    await sleep(900);

    expect(c.seen).not.toContain(second);
  });

  it("reports a file created inside a directory that did not exist when it started", async () => {
    const nested = join(root, "later", "a.ts");
    const c = collector();
    start({ paths: [nested], onChange: c.onChange });
    await sleep(SETTLE_MS);

    mkdirSync(join(root, "later"));
    writeFileSync(nested, "1");

    expect(await c.waitFor(nested, 4000)).toBe(true);
  });

  it("coalesces a burst of writes into a single report", async () => {
    const file = join(root, "a.ts");
    writeFileSync(file, "1");
    let calls = 0;
    start({
      paths: [file],
      onChange: () => {
        calls += 1;
      },
      debounceMs: 150,
    });
    await sleep(SETTLE_MS);
    calls = 0;

    for (let i = 0; i < 5; i += 1) writeFileSync(file, `v${i}`);
    await sleep(1000);

    expect(calls).toBe(1);
  });

  it("reports nothing once stopped", async () => {
    const file = join(root, "a.ts");
    writeFileSync(file, "1");
    const c = collector();
    const set = start({ paths: [file], onChange: c.onChange });
    await sleep(SETTLE_MS);
    c.seen.length = 0;

    set.stop();
    writeFileSync(file, "2");
    await sleep(900);

    expect(c.seen).toEqual([]);
  });

  it("reports one save of a file tracked in mixed case once, by the path it is tracked under", async () => {
    const mixed = join(root, "MixedCase.ts");
    writeFileSync(mixed, "export const v = 1;\n");
    const c = collector();
    start({ paths: [mixed], onChange: c.onChange, debounceMs: 20 });
    await sleep(SETTLE_MS);

    writeFileSync(mixed, "export const v = 2;\n");
    await sleep(1500);

    expect(c.seen).toEqual([mixed]);
  });

  it("drops a change it is told was already seen, and reports the next one", async () => {
    const file = join(root, "courier.mocks.ts");
    writeFileSync(file, "export default {};\n");
    const c = collector();
    const set = start({ paths: [file], onChange: c.onChange, debounceMs: 20 });
    await sleep(SETTLE_MS);

    writeFileSync(file, "export default { a: {} };\n");
    set.acknowledge([file]);
    await sleep(1200);
    expect(c.seen).toEqual([]);

    writeFileSync(file, "export default { b: {} };\n");
    expect(await c.waitFor(file)).toBe(true);
  });

  it("counts what it tracks", async () => {
    const first = join(root, "a.ts");
    const second = join(root, "nested", "b.ts");
    mkdirSync(join(root, "nested"));
    writeFileSync(first, "1");
    writeFileSync(second, "1");
    const set = start({ paths: [first, second], onChange: () => {} });

    expect(set.status()).toMatchObject({ pathCount: 2, directoryCount: 2, degraded: null });

    set.update([first]);
    expect(set.status()).toMatchObject({ pathCount: 1, directoryCount: 1 });
  });

  it("reports no refused watch for a path in a directory that does not exist yet", async () => {
    const onDegraded = vi.fn();
    const set = start({ paths: [join(root, "later", "a.ts")], onChange: () => {}, onDegraded });

    await sleep(SETTLE_MS);

    expect(set.status()).toMatchObject({ directoryCount: 0, degraded: null });
    expect(onDegraded).not.toHaveBeenCalled();
  });

  it("update() reports at once, and once, a path whose bytes differ from the ones a load read", async () => {
    const file = join(root, "deep.ts");
    writeFileSync(file, "export const v = 1;\n");
    const c = collector();
    const set = start({ paths: [], onChange: c.onChange, debounceMs: 20 });
    await sleep(SETTLE_MS);

    writeFileSync(file, "export const v = 2;\n");
    set.update([file], new Map([[file, sha256("export const v = 1;\n")]]));

    expect(c.seen).toEqual([file]);
    await sleep(1500);
    expect(c.seen).toEqual([file]);
  });

  it("update() reports nothing for a path that still holds the bytes a load read", async () => {
    const file = join(root, "deep.ts");
    const missing = join(root, "courier.config.ts");
    writeFileSync(file, "export const v = 1;\n");
    const c = collector();
    const set = start({ paths: [], onChange: c.onChange, debounceMs: 20 });
    await sleep(SETTLE_MS);

    set.update(
      [file, missing],
      new Map([
        [file, sha256("export const v = 1;\n")],
        [missing, null],
      ]),
    );
    await sleep(1200);

    expect(c.seen).toEqual([]);
  });

  it("update() reports at once a path created since a load found it absent, and then its next save", async () => {
    const created = join(root, "courier.config.ts");
    const c = collector();
    const set = start({ paths: [], onChange: c.onChange, debounceMs: 20 });
    await sleep(SETTLE_MS);

    writeFileSync(created, "export default {};\n");
    set.update([created], new Map([[created, null]]));
    expect(c.seen).toEqual([created]);
    await sleep(SETTLE_MS);
    c.seen.length = 0;

    writeFileSync(created, "export default { sources: {} };\n");

    expect(await c.waitFor(created)).toBe(true);
  });

  it("sweep() reports at once a change still waiting out the debounce, and the later notification of it is dropped", async () => {
    const file = join(root, "a.ts");
    writeFileSync(file, "export const v = 1;\n");
    const c = collector();
    const set = start({ paths: [file], onChange: c.onChange, debounceMs: 2000 });
    await sleep(SETTLE_MS);

    /* Restored with the time it was saved at, as `cp -p` or `rsync -t` restore
       a file: the change is older than the debounce, and its notification
       still waits the debounce out. */
    writeFileSync(file, "export const v = 2;\n");
    const savedAt = new Date(Date.now() - 60_000);
    utimesSync(file, savedAt, savedAt);
    await sleep(SETTLE_MS);
    expect(c.seen).toEqual([]);

    const asked = Date.now();
    const reported = await set.sweep(soon());

    expect(Date.now() - asked).toBeLessThan(500);
    expect(reported).toBe(true);
    expect(c.seen).toEqual([file]);
    await sleep(2500);
    expect(c.seen).toEqual([file]);
  });

  it("sweep() waits for a path changed a moment ago to be still for a debounce, and reports the two-step save once", async () => {
    const file = join(root, "courier.config.ts");
    writeFileSync(file, "export default { sources: {} };\n");
    const c = collector();
    const set = start({ paths: [file], onChange: c.onChange, debounceMs: 300 });
    await sleep(SETTLE_MS);

    /* An editor that empties the file, then writes it whole. */
    writeFileSync(file, "");
    const sweeping = set.sweep(soon());
    await sleep(60);
    expect(c.seen).toEqual([]);
    writeFileSync(file, "export default { sources: { api: {} } };\n");
    expect(await sweeping).toBe(true);

    expect(c.seen).toEqual([file]);
    await sleep(1500);
    expect(c.seen).toEqual([file]);
  });

  it("sweep() waits for a file renamed away a moment ago to be written anew, and reports that save once", async () => {
    const file = join(root, "courier.config.ts");
    writeFileSync(file, "export default { sources: {} };\n");
    const c = collector();
    const set = start({ paths: [file], onChange: c.onChange, debounceMs: 300 });
    await sleep(SETTLE_MS);

    /* An editor that renames the file away, then writes it anew. */
    renameSync(file, join(root, "courier.config.ts~"));
    const sweeping = set.sweep(soon());
    await sleep(60);
    expect(c.seen).toEqual([]);
    writeFileSync(file, "export default { sources: { api: {} } };\n");
    expect(await sweeping).toBe(true);

    expect(c.seen).toEqual([file]);
    await sleep(1500);
    expect(c.seen).toEqual([file]);
  });

  it("concurrent sweeps share one pass", async () => {
    const files = ["a.ts", "b.ts", "c.ts"].map((name) => join(root, name));
    for (const file of files) writeFileSync(file, "export const v = 1;\n");
    const c = collector();
    const set = start({ paths: files, onChange: c.onChange, debounceMs: 20 });
    await sleep(SETTLE_MS);
    signing.count = 0;

    await Promise.all([set.sweep(soon()), set.sweep(soon()), set.sweep(soon())]);
    const shared = signing.count;
    await set.sweep(soon());

    expect(shared).toBe(files.length);
    expect(signing.count).toBe(files.length * 2);
    expect(c.seen).toEqual([]);
  });
  it("sweep() waits while files are saved one after another, and reports the burst only once the last is written", async () => {
    const first = join(root, "a.ts");
    const files = [first, ...["b.ts", "c.ts", "d.ts", "e.ts"].map((name) => join(root, name))];
    for (const file of files) writeFileSync(file, "export const v = 1;\n");
    const reports: Array<{ at: number; paths: string[] }> = [];
    const set = start({
      paths: files,
      onChange: (paths) => reports.push({ at: Date.now(), paths }),
      debounceMs: 300,
    });
    await sleep(SETTLE_MS);

    /* A code generator writing one file after another, each well within the debounce of the last. */
    writeFileSync(first, "export const v = 2;\n");
    const sweeping = set.sweep(soon());
    for (const file of files.slice(1)) {
      await sleep(100);
      writeFileSync(file, "export const v = 2;\n");
    }
    const lastWrittenAt = Date.now();
    const reported = await sweeping;

    expect(reported).toBe(true);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.filter(({ at }) => at < lastWrittenAt)).toEqual([]);
    expect(reports.flatMap(({ paths }) => paths).sort()).toEqual([...files].sort());
  });

  it("sweep() reports nothing and resolves false when saves still come at its deadline", async () => {
    const file = join(root, "generated.ts");
    writeFileSync(file, "export const v = 0;\n");
    const c = collector();
    const set = start({ paths: [file], onChange: c.onChange, debounceMs: 300 });
    await sleep(SETTLE_MS);

    let version = 0;
    const saving = setInterval(() => {
      version += 1;
      writeFileSync(file, `export const v = ${version};\n`);
    }, 30);
    try {
      await sleep(100);
      const asked = Date.now();
      const reported = await set.sweep(asked + 700);
      const tookMs = Date.now() - asked;

      expect(reported).toBe(false);
      expect(tookMs).toBeGreaterThanOrEqual(400);
      expect(tookMs).toBeLessThan(1_500);
      expect(c.seen).toEqual([]);
    } finally {
      clearInterval(saving);
    }
    expect(await c.waitFor(file)).toBe(true);
  });

  it("a sweep shared by two callers waits for saves in progress until the later deadline", async () => {
    const file = join(root, "generated.ts");
    writeFileSync(file, "export const v = 0;\n");
    const set = start({ paths: [file], onChange: () => {}, debounceMs: 300 });
    await sleep(SETTLE_MS);

    let version = 0;
    const saving = setInterval(() => {
      version += 1;
      writeFileSync(file, `export const v = ${version};\n`);
    }, 30);
    try {
      await sleep(100);
      const asked = Date.now();
      const early = set.sweep(asked + 100);
      const late = set.sweep(asked + 1_000);

      expect(await early).toBe(false);
      expect(Date.now() - asked).toBeGreaterThanOrEqual(700);
      expect(await late).toBe(false);
    } finally {
      clearInterval(saving);
    }
  });

  it("a symlink loop at a watched path is signed as unreadable, and a sweep still reports another save", async () => {
    const loop = join(root, "courier.config.mjs");
    symlinkSync("courier.config.mjs", loop);
    const file = join(root, "a.ts");
    writeFileSync(file, "export const v = 1;\n");
    const c = collector();
    const set = start({ paths: [loop, file], onChange: c.onChange, debounceMs: 100 });
    await sleep(SETTLE_MS);

    writeFileSync(file, "export const v = 2;\n");
    const reported = await set.sweep(soon());

    expect(reported).toBe(true);
    expect(c.seen).toEqual([file]);
  });

  it("a symlink loop created at a watched path is reported as a change", async () => {
    const loop = join(root, "courier.config.mjs");
    const c = collector();
    start({ paths: [loop], onChange: c.onChange, debounceMs: 20 });
    await sleep(SETTLE_MS);

    symlinkSync("courier.config.mjs", loop);

    expect(await c.waitFor(loop)).toBe(true);
  });
});
