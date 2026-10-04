import { describe, expect, it } from "vitest";

import { stateMayDiffer } from "../src/server/state-may-differ";
import type { WatchedState } from "../src/server/watched-state";

const NOW = 1_800_000_000_000;
const settled: WatchedState = {
  mtimeMs: NOW - 60_000,
  ctimeMs: NOW - 60_000,
  size: 10,
  ino: 7,
  error: null,
};

describe("stateMayDiffer", () => {
  it("is false for a path looked up as it was, its timestamp long past", () => {
    expect(stateMayDiffer(settled, { ...settled }, NOW)).toBe(false);
  });

  it.each([
    ["timestamp", { mtimeMs: settled.mtimeMs + 1 }],
    ["status-change time", { ctimeMs: settled.ctimeMs + 1 }],
    ["size", { size: 11 }],
    ["inode", { ino: 8 }],
    ["error", { error: "EACCES" }],
  ])("is true when the %s changed", (_, change) => {
    expect(stateMayDiffer(settled, { ...settled, ...change }, NOW)).toBe(true);
  });

  it("is true for a timestamp recent enough to share its tick with the next save, though nothing differs", () => {
    const recent = { ...settled, mtimeMs: NOW - 500 };

    expect(stateMayDiffer(recent, { ...recent }, NOW)).toBe(true);
  });

  it("is true for a path created or deleted, and false while nothing is there", () => {
    expect(stateMayDiffer(null, settled, NOW)).toBe(true);
    expect(stateMayDiffer(settled, null, NOW)).toBe(true);
    expect(stateMayDiffer(null, null, NOW)).toBe(false);
  });
});
