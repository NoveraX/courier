import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createWatchSet, type WatchSet } from "../src/server/watch-set";

/**
 * Each test gets its own directory: the filesystem reports the fixture's own
 * creation with a delay of its own, and in a reused directory those late
 * notifications are indistinguishable from the change under test.
 */
let root: string;
let sets: WatchSet[];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Long enough for a native notification, short enough to keep the suite quick. */
const SETTLE_MS = 250;

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
});
