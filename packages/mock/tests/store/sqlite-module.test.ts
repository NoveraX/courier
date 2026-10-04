import { afterEach, describe, expect, it, vi } from "vitest";

import { loadSqlite, withoutSqliteWarning } from "../../src/store/sqlite-module";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withoutSqliteWarning", () => {
  it("drops the warning Node 22 prints as node:sqlite loads, and passes every other on", async () => {
    const emitted = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);

    await withoutSqliteWarning(async () => {
      process.emitWarning(
        "SQLite is an experimental feature and might change at any time",
        "ExperimentalWarning",
      );
      process.emitWarning("Something else", "ExperimentalWarning");
    });

    expect(emitted).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledWith("Something else", "ExperimentalWarning");
  });

  it("puts process.emitWarning back, though the load fails", async () => {
    const before = process.emitWarning;

    await expect(
      withoutSqliteWarning(async () => Promise.reject(new Error("no module"))),
    ).rejects.toThrow("no module");

    expect(process.emitWarning).toBe(before);
  });
});

describe("loadSqlite", () => {
  it("gives Node's SQLite, the same module each time", async () => {
    const first = await loadSqlite();

    expect(typeof first?.DatabaseSync).toBe("function");
    expect(await loadSqlite()).toBe(first);
  });
});
