/**
 * What a load's mocks do to the mock manager: a file that loaded replaces the
 * mocks, each with the config's source it serves, one that did not leaves
 * them as they were and says why, and a project without one declares none.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyLoadedMocks } from "../src/server/apply-loaded-mocks";
import type { LoadedCourierConfig, LoadedCourierMocks } from "../src/server/config-loader";

const ROOT = "/p";
const FILE = "/p/courier.mocks.ts";

function consumers() {
  const calls: string[] = [];
  const mockRegistry = {
    syncFromMocks: vi.fn(
      (
        mocks: Record<string, unknown>,
        _fingerprints?: ReadonlyMap<string, string>,
        _sources?: ReadonlyMap<string, string>,
      ) => calls.push(`sync ${Object.keys(mocks).join(",")}`),
    ),
    getEntries: vi.fn(() => []),
    attach: vi.fn(() => () => {}),
  };
  const mockManager = {
    setMocksFile: vi.fn((status: { file: string | null; error: string | null }) =>
      calls.push(`status ${status.file} ${status.error}`),
    ),
  };
  return { calls, mockRegistry, mockManager };
}

function mocks(
  overrides: Partial<LoadedCourierMocks>,
  sources: Record<string, unknown> = {},
): Pick<LoadedCourierConfig, "mocks" | "config"> {
  return {
    mocks: { file: FILE, entries: {}, contentHash: "abc", error: null, ...overrides },
    config: { sources } as LoadedCourierConfig["config"],
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyLoadedMocks", () => {
  it("tells the manager which file loaded before the mocks it declares arrive", () => {
    const target = consumers();

    applyLoadedMocks(mocks({ entries: { a: {}, b: {} } }), target, ROOT);

    expect(target.calls).toEqual([`status ${FILE} null`, "sync a,b"]);
  });

  it("leaves the mocks as they were when the file did not load, and passes on why", () => {
    const target = consumers();

    applyLoadedMocks(mocks({ error: new SyntaxError("Unexpected token") }), target, ROOT);

    expect(target.calls).toEqual([`status ${FILE} Unexpected token`]);
    expect(target.mockRegistry.syncFromMocks).not.toHaveBeenCalled();
  });

  it("passes on the loader's message on one line, naming paths from the project root", () => {
    const target = consumers();

    applyLoadedMocks(
      mocks({ error: new Error("ParseError: Unexpected token  \n /p/courier.mocks.ts:3:0") }),
      target,
      ROOT,
    );

    expect(target.mockManager.setMocksFile).toHaveBeenCalledWith({
      file: FILE,
      error: "ParseError: Unexpected token courier.mocks.ts:3:0",
    });
  });

  it("passes on why a file that threw a value with no string form did not load", () => {
    const target = consumers();

    applyLoadedMocks(mocks({ error: Object.create(null) }), target, ROOT);

    expect(target.calls).toEqual([`status ${FILE} [Object: null prototype] {}`]);
  });

  it("logs a file that did not load, with its error", () => {
    const target = consumers();
    const error = new SyntaxError("Unexpected token");

    applyLoadedMocks(mocks({ error }), target, ROOT);

    const [call] = vi.mocked(console.warn).mock.calls;
    expect(call).toBeDefined();
    expect(String(call?.[1])).toContain(`${FILE} failed to load`);
    expect(call).toContain(error);
  });

  it("removes every mock when the project has no mocks file", () => {
    const target = consumers();

    applyLoadedMocks(mocks({ file: null, contentHash: null }), target, ROOT);

    expect(target.calls).toEqual(["status null null", "sync "]);
  });

  it("names the config's source each mock serves, and none for a mock of another API", () => {
    const target = consumers();
    const shop = { name: "shop" };
    const elsewhere = { name: "elsewhere" };

    applyLoadedMocks(
      mocks({ entries: { shopMock: { source: shop }, other: { source: elsewhere } } }, { shop }),
      target,
      ROOT,
    );

    const [, , served] = target.mockRegistry.syncFromMocks.mock.calls[0] ?? [];
    expect(served).toEqual(new Map([["shopMock", "shop"]]));
  });
});
