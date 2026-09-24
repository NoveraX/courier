/**
 * @vitest-environment node
 */
import type { TransformOptions, TransformResult } from "jiti";
import { describe, expect, it, vi } from "vitest";

import { createTransformCache } from "../src/runtime/transform-cache";

const FILE = "/project/courier.config.ts";

function optionsFor(overrides: Partial<TransformOptions> = {}): TransformOptions {
  return {
    filename: FILE,
    source: "export default { sources: {} };",
    ts: true,
    async: true,
    jsx: false,
    interopDefault: true,
    babel: {},
    ...overrides,
  };
}

function compiler(): (options: TransformOptions) => TransformResult {
  return vi.fn((options: TransformOptions) => ({
    code: `compiled(${options.filename}):${options.source}`,
  }));
}

/** Returns each source as its own code, so a result names the input that made it. */
function echo(options: TransformOptions): TransformResult {
  return { code: options.source };
}

describe("createTransformCache", () => {
  it("computes once for an unchanged source and again after it changes", () => {
    const cache = createTransformCache();
    const compute = compiler();

    const first = cache.transform(optionsFor(), compute);
    const second = cache.transform(optionsFor(), compute);
    const edited = cache.transform(optionsFor({ source: "export default { edited: 1 };" }), compute);

    expect(compute).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
    expect(edited).toEqual({ code: `compiled(${FILE}):export default { edited: 1 };` });
  });

  describe("keys on every option that changes the output, not only the file", () => {
    it.each<[string, Partial<TransformOptions>]>([
      ["async", { async: false }],
      ["ts", { ts: false }],
      ["jsx", { jsx: { runtime: "automatic" } }],
      ["interopDefault", { interopDefault: false }],
      ["retainLines", { retainLines: false }],
      ["babel", { babel: { sourceMaps: "inline", sourceFileName: FILE } }],
    ])("transforms again when only %s differs", (_name, variant) => {
      const cache = createTransformCache();
      const compute = compiler();

      cache.transform(optionsFor(), compute);
      cache.transform(optionsFor(variant), compute);

      expect(compute).toHaveBeenCalledTimes(2);
      expect(compute).toHaveBeenLastCalledWith(optionsFor(variant));
    });
  });

  it("keeps a sync and an async transform of one file in separate entries", () => {
    const cache = createTransformCache();
    const compute = compiler();

    cache.transform(optionsFor({ async: false }), compute);
    cache.transform(optionsFor({ async: true }), compute);
    cache.transform(optionsFor({ async: false }), compute);
    cache.transform(optionsFor({ async: true }), compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("transforms again a source whose transform failed, and hands back the later success", () => {
    const cache = createTransformCache();
    const overflow = new RangeError("Maximum call stack size exceeded");
    const failure = 'exports.__JITI_ERROR__ = {"line":0,"column":0,"message":"Maximum call stack size exceeded"}';
    const compute = vi
      .fn<(options: TransformOptions) => TransformResult>()
      .mockReturnValueOnce({ code: failure, error: overflow })
      .mockReturnValue({ code: "compiled" });

    const cold = cache.transform(optionsFor(), compute);
    const warm = cache.transform(optionsFor(), compute);
    const kept = cache.transform(optionsFor(), compute);

    expect(cold).toEqual({ code: failure, error: overflow });
    expect(warm).toEqual({ code: "compiled" });
    expect(kept).toEqual({ code: "compiled" });
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("hands jiti every failure with its error, however often the same bytes fail", () => {
    const cache = createTransformCache();
    const parseError = new SyntaxError("Unexpected token");
    const failure = 'exports.__JITI_ERROR__ = {"code":"ParseError","message":"Unexpected token"}';
    const compute = vi.fn((_options: TransformOptions) => ({ code: failure, error: parseError }));
    const broken = optionsFor({ source: "export default {" });

    const first = cache.transform(broken, compute);
    const second = cache.transform(broken, compute);

    expect(compute).toHaveBeenCalledTimes(2);
    expect(first).toEqual({ code: failure, error: parseError });
    expect(second).toEqual({ code: failure, error: parseError });
  });

  it("drops the least recently used file beyond the memory bound", () => {
    const cache = createTransformCache({ maxMemoryChars: 20 });
    const compute = vi.fn(echo);
    const file = (name: string): TransformOptions => optionsFor({ filename: `/p/${name}.ts`, source: "8 chars." });

    cache.transform(file("a"), compute);
    cache.transform(file("b"), compute);
    cache.transform(file("a"), compute);
    cache.transform(file("c"), compute);
    cache.transform(file("a"), compute);
    cache.transform(file("c"), compute);
    cache.transform(file("b"), compute);

    expect(compute.mock.calls.map(([options]) => options.filename)).toEqual([
      "/p/a.ts",
      "/p/b.ts",
      "/p/c.ts",
      "/p/b.ts",
    ]);
  });

  it("keeps no transform larger than the memory bound, and drops nothing for it", () => {
    const cache = createTransformCache({ maxMemoryChars: 10 });
    const compute = vi.fn(echo);
    const small = optionsFor({ filename: "/p/small.ts", source: "8 chars." });
    const large = optionsFor({ filename: "/p/large.ts", source: "twelve chars" });

    cache.transform(small, compute);
    cache.transform(large, compute);
    cache.transform(large, compute);
    cache.transform(small, compute);

    expect(compute.mock.calls.map(([options]) => options.filename)).toEqual([
      "/p/small.ts",
      "/p/large.ts",
      "/p/large.ts",
    ]);
  });

  it("keeps nothing in memory with a bound of 0, not even an empty transform", () => {
    const cache = createTransformCache({ maxMemoryChars: 0 });
    const compute = vi.fn(echo);
    const empty = optionsFor({ source: "" });

    cache.transform(empty, compute);
    cache.transform(empty, compute);
    cache.transform(optionsFor(), compute);
    cache.transform(optionsFor(), compute);

    expect(compute).toHaveBeenCalledTimes(4);
  });

  it.each<[string, unknown]>([
    ["a babel plugin given as a function", [() => ({ visitor: {} })]],
    ["a pattern", [/generated/]],
    ["a function that defines toJSON", [Object.assign(() => ({ visitor: {} }), { toJSON: () => "plugin" })]],
    ["a Map", new Map([["retainLines", true]])],
  ])("transforms every time when a babel option holds %s, which no digest tells apart", (_name, value) => {
    const cache = createTransformCache();
    const compute = compiler();
    const options = optionsFor({ babel: { plugins: value } });

    cache.transform(options, compute);
    cache.transform(options, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("transforms a babel option that refers to itself every time, instead of throwing", () => {
    const cache = createTransformCache();
    const compute = compiler();
    const cyclic: Record<string, unknown> = { compact: false };
    cyclic.self = cyclic;
    const options = optionsFor({ babel: { cyclic } });

    const first = cache.transform(options, compute);
    const second = cache.transform(options, compute);

    expect(compute).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
  });

  it("keeps a transform whose options reach one object twice without a cycle", () => {
    const cache = createTransformCache();
    const compute = compiler();
    const shared = { loose: true };
    const options = optionsFor({ babel: { assumptions: shared, parserOpts: { shared } } });

    cache.transform(options, compute);
    cache.transform(options, compute);

    expect(compute).toHaveBeenCalledTimes(1);
  });

  describe("hands back the transform of the options it is given, not of a kept look-alike", () => {
    it.each<[string, Partial<TransformOptions>, Partial<TransformOptions>]>([
      ["an option left out and one set to undefined", { babel: {} }, { babel: { retainLines: undefined } }],
      ["NaN and null", { babel: { level: Number.NaN } }, { babel: { level: null } }],
      ["-0 and 0", { babel: { level: -0 } }, { babel: { level: 0 } }],
      ["a lone surrogate and the character that replaces it", { source: "'\uD800'" }, { source: "'\uFFFD'" }],
    ])("%s", (_name, first, second) => {
      const cache = createTransformCache();
      const compute = vi.fn((options: TransformOptions) => ({ code: JSON.stringify(options) }));
      const expected = JSON.stringify(optionsFor(second));

      cache.transform(optionsFor(first), compute);
      const handed = cache.transform(optionsFor(second), compute);

      expect(compute).toHaveBeenCalledTimes(2);
      expect(handed).toEqual({ code: expected });
    });
  });

  it("transforms a source with no file name every time", () => {
    const cache = createTransformCache();
    const compute = compiler();
    const nameless = optionsFor({ filename: undefined });

    cache.transform(nameless, compute);
    cache.transform(nameless, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("transforms a file named by a relative path every time, since its import.meta.url follows the working directory", () => {
    const cache = createTransformCache();
    const compute = compiler();
    const relative = optionsFor({ filename: "src/courier.config.ts" });

    cache.transform(relative, compute);
    cache.transform(relative, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });
});
