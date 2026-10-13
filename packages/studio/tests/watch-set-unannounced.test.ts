/**
 * A watch set on a filesystem that announces no save — a network share, a
 * container's bind mount: native watches arm and never fire, and every
 * change is caught by the comparison pass, which keeps no timer per path.
 */
import { EventEmitter } from "node:events";
import type * as Fs from "node:fs";
import { mkdtempSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return {
    ...actual,
    watch: vi.fn(() => Object.assign(new EventEmitter(), { close: () => undefined })),
    watchFile: vi.fn(actual.watchFile),
  };
});

import { watchFile } from "node:fs";
import { createNotificationTrust } from "../src/server/notification-trust";
import { createWatchSet, type WatchSet } from "../src/server/watch-set";

let root: string;
let set: WatchSet | undefined;

const LONG_AGO = new Date(Date.now() - 60_000);

function collector() {
  const seen: string[] = [];
  return {
    onChange: (changed: string[]) => seen.push(...changed),
    seen,
    async waitFor(path: string, budgetMs = 2_000): Promise<boolean> {
      for (let waited = 0; waited < budgetMs; waited += 25) {
        if (seen.includes(path)) return true;
        await new Promise((r) => setTimeout(r, 25));
      }
      return false;
    },
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-unannounced-"));
  vi.mocked(watchFile).mockClear();
});

afterEach(() => {
  set?.stop();
  set = undefined;
  rmSync(root, { recursive: true, force: true });
});

describe("a watch set where no save is announced", () => {
  it("reports an edit, a deletion and the absent path created within a pass, where it knows to compare every pass", async () => {
    const file = join(root, "api.ts");
    writeFileSync(file, "1");
    utimesSync(file, LONG_AGO, LONG_AGO);
    const twin = join(root, "api.js");
    const c = collector();
    set = createWatchSet({
      paths: [file, twin],
      onChange: c.onChange,
      debounceMs: 20,
      trust: createNotificationTrust({ pollEverywhere: true }),
    });

    writeFileSync(file, "22");
    expect(await c.waitFor(file)).toBe(true);

    writeFileSync(twin, "export {};");
    expect(await c.waitFor(twin)).toBe(true);

    c.seen.length = 0;
    unlinkSync(file);
    expect(await c.waitFor(file)).toBe(true);
  });

  it("finds a save no notification announced with its safety net, and from the second compares the whole filesystem every pass", async () => {
    const file = join(root, "api.ts");
    writeFileSync(file, "1");
    const twin = join(root, "api.js");
    const c = collector();
    set = createWatchSet({
      paths: [file, twin],
      onChange: c.onChange,
      debounceMs: 10,
      comparison: { intervalMs: 20, safetyEvery: 5, graceMs: 0 },
      trust: createNotificationTrust({ platform: "darwin" }),
    });
    expect(set.status()).toMatchObject({ comparedCount: 2, comparedEveryPass: 0 });

    /* Each save is dated a while back, as one the safety net comes to late
       is: with no grace, a timestamp the filesystem stamped a moment ahead of
       Node's clock would be reported but not counted as a miss. */
    writeFileSync(file, "22");
    utimesSync(file, LONG_AGO, LONG_AGO);
    expect(await c.waitFor(file)).toBe(true);
    expect(set.status().comparedEveryPass).toBe(0);

    c.seen.length = 0;
    writeFileSync(file, "333");
    const later = new Date(LONG_AGO.getTime() + 1_000);
    utimesSync(file, later, later);
    expect(await c.waitFor(file)).toBe(true);
    expect(set.status().comparedEveryPass).toBe(2);
  });

  it("keeps no timer per path", () => {
    const paths = ["a.ts", "a.js", "a.mjs", "a.cjs", "b.ts"].map((name) => join(root, name));
    writeFileSync(paths[0] as string, "1");
    set = createWatchSet({ paths, onChange: () => {} });

    expect(watchFile).not.toHaveBeenCalled();
    expect(set.status().comparedCount).toBe(2);
  });
});
