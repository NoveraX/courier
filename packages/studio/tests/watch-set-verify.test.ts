import { mkdirSync, mkdtempSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createVerifier, type Verifier } from "../src/server/watch-set-verify";

const INTERVAL_MS = 30;

let root: string;
let verifiers: Verifier[];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A timestamp well outside the window in which a save may share its tick. */
const LONG_AGO = new Date(Date.now() - 60_000);

/** A verifier that looks every path up every pass, unless told some directories announce their saves. */
function start(
  paths: readonly string[],
  {
    announces = () => false,
    safetyEvery = 4,
  }: { announces?: () => boolean; safetyEvery?: number } = {},
) {
  const suspected: string[] = [];
  const verifier = createVerifier({
    intervalMs: INTERVAL_MS,
    safetyEvery,
    announces,
    onSuspect: (p) => suspected.push(p),
  });
  verifier.sync(paths);
  verifiers.push(verifier);
  return { verifier, suspected };
}

/** Date a path long past, so a pass hands it on only when it changes. */
function settle(path: string): void {
  utimesSync(path, LONG_AGO, LONG_AGO);
}

/** A file whose timestamp is long past; its directory's too, as creating it moved that one. */
function settledFile(path: string, text = "1"): string {
  writeFileSync(path, text);
  settle(path);
  return path;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-verify-"));
  verifiers = [];
});

afterEach(() => {
  for (const verifier of verifiers) verifier.stop();
  vi.useRealTimers();
  rmSync(root, { recursive: true, force: true });
});

describe("createVerifier", () => {
  it("hands on nothing while nothing changes", async () => {
    const file = settledFile(join(root, "a.ts"));
    settle(root);
    const { suspected } = start([file, join(root, "absent.ts")]);

    await sleep(INTERVAL_MS * 5);

    expect(suspected).toEqual([]);
  });

  it("hands on a file that changed", async () => {
    const file = settledFile(join(root, "a.ts"));
    const { suspected } = start([file]);

    settledFile(file, "22");
    await sleep(INTERVAL_MS * 4);

    expect(suspected).toContain(file);
  });

  it("looks up one directory for every absent path in it, and hands on the one created", async () => {
    const absent = ["a.js", "a.mjs", "a.cjs", "a.js.ts"].map((name) => join(root, name));
    const present = settledFile(join(root, "a.ts"));
    settle(root);
    const { verifier, suspected } = start([present, ...absent]);

    expect(verifier.size).toBe(2);

    settledFile(join(root, "a.mjs"));
    await sleep(INTERVAL_MS * 4);

    expect(suspected).toContain(join(root, "a.mjs"));
    expect(verifier.size).toBe(3);
  });

  it("hands on a path created in a directory that did not exist", async () => {
    const nested = join(root, "later", "a.ts");
    const { suspected } = start([nested]);

    mkdirSync(join(root, "later"));
    writeFileSync(nested, "1");
    await sleep(INTERVAL_MS * 4);

    expect(suspected).toContain(nested);
  });

  it("hands on a file deleted, then its re-creation", async () => {
    const file = settledFile(join(root, "a.ts"));
    const { suspected } = start([file]);

    unlinkSync(file);
    await sleep(INTERVAL_MS * 4);
    expect(suspected).toContain(file);

    settle(root);
    await sleep(INTERVAL_MS * 3);
    suspected.length = 0;
    await sleep(INTERVAL_MS * 3);
    expect(suspected).toEqual([]);

    writeFileSync(file, "2");
    await sleep(INTERVAL_MS * 4);
    expect(suspected).toContain(file);
  });

  it("hands on a file on every pass while its timestamp may still share a tick with the next save", async () => {
    const file = join(root, "a.ts");
    writeFileSync(file, "1");
    const { suspected } = start([file]);

    await sleep(INTERVAL_MS * 5);
    expect(suspected.filter((p) => p === file).length).toBeGreaterThan(2);

    utimesSync(file, LONG_AGO, LONG_AGO);
    await sleep(INTERVAL_MS * 2);
    const settled = suspected.length;
    await sleep(INTERVAL_MS * 4);
    expect(suspected.length).toBe(settled);
  });

  it("stops comparing a path no longer synced", async () => {
    const file = settledFile(join(root, "a.ts"));
    const { verifier, suspected } = start([file]);

    verifier.sync([]);
    settledFile(file, "22");
    await sleep(INTERVAL_MS * 4);

    expect(suspected).toEqual([]);
    expect(verifier.size).toBe(0);
  });

  it("looks a path where saves are announced up only once every safetyEvery passes", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const file = settledFile(join(root, "a.ts"));
    const { suspected } = start([file], { announces: () => true, safetyEvery: 4 });
    vi.advanceTimersByTime(INTERVAL_MS);

    settledFile(file, "22");
    vi.advanceTimersByTime(INTERVAL_MS * 3);
    expect(suspected).toEqual([]);

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(suspected).toEqual([file]);
  });

  it("looks a path up every pass once retier() finds its directory announces nothing", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let announced = true;
    const file = settledFile(join(root, "a.ts"));
    const { verifier, suspected } = start([file], { announces: () => announced, safetyEvery: 4 });
    vi.advanceTimersByTime(INTERVAL_MS);

    announced = false;
    verifier.retier();
    settledFile(file, "22");
    vi.advanceTimersByTime(INTERVAL_MS);

    expect(suspected).toEqual([file]);
  });
});
