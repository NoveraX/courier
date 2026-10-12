/**
 * What an editor asks Studio for every few seconds is worked out again only
 * when what it comes from changed: where each endpoint is declared, once a
 * file it was read from changes or the config reloads; the audit's
 * findings, once the requests, the sources or the runtimes change — and
 * while requests keep coming, at most every two seconds.
 */
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fileBoundCache } from "../../src/server/editor/file-bound-cache";
import { findingsCache } from "../../src/server/editor/findings-cache";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "courier-editor-caches-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "api.ts"), "export const api = 1;\n");
  return root;
}

describe("a value worked out from the project's files", () => {
  it("is kept while the config and every file it read stay as they were", () => {
    const root = project();
    const cache = fileBoundCache<number>(root);
    const config = {};
    const compute = vi.fn((modules) => {
      modules.module(join(modules.root, "api.ts"));
      return compute.mock.calls.length;
    });

    expect(cache.read(config, compute)).toBe(1);
    expect(cache.read(config, compute)).toBe(1);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("is worked out again once a file it read changes, or the config reloads", () => {
    const root = project();
    const cache = fileBoundCache<number>(root);
    const config = {};
    const compute = vi.fn((modules) => {
      modules.module(join(modules.root, "api.ts"));
      return compute.mock.calls.length;
    });
    cache.read(config, compute);

    writeFileSync(join(root, "api.ts"), "export const api = 2;\n");
    const later = new Date(Date.now() + 5_000);
    utimesSync(join(root, "api.ts"), later, later);
    const afterEdit = cache.read(config, compute);
    const afterReload = cache.read({}, compute);

    expect([afterEdit, afterReload]).toEqual([2, 3]);
  });
});

describe("the findings an editor places at its calls", () => {
  function inputs() {
    const state = { version: 1, declared: [] as unknown[], runtimes: [] as unknown[] };
    const events = vi.fn(() => []);
    return {
      state,
      events,
      inputs: {
        requestLog: { events, version: () => state.version },
        declared: () => state.declared as never,
        runtimes: () => state.runtimes as never,
      },
    };
  }

  it("are kept while the requests, the sources and the runtimes stay the same", () => {
    const { events, inputs: given } = inputs();
    let clock = 0;
    const cache = findingsCache(given, () => clock);

    cache.read();
    clock = 60_000;
    cache.read();

    expect(events).toHaveBeenCalledTimes(1);
  });

  it("are worked out again once the requests change, at most every two seconds", () => {
    const { state, events, inputs: given } = inputs();
    let clock = 0;
    const cache = findingsCache(given, () => clock);
    cache.read();

    state.version = 2;
    clock = 1_000;
    cache.read();
    const withinTwoSeconds = events.mock.calls.length;
    clock = 2_500;
    cache.read();

    expect(withinTwoSeconds).toBe(1);
    expect(events).toHaveBeenCalledTimes(2);
  });

  it("are worked out again once the sources are scanned anew", () => {
    const { state, events, inputs: given } = inputs();
    let clock = 0;
    const cache = findingsCache(given, () => clock);
    cache.read();

    state.declared = [];
    clock = 3_000;
    cache.read();

    expect(events).toHaveBeenCalledTimes(2);
  });
});
