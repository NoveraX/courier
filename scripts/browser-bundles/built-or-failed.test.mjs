/**
 * A bundler that fails to build a scenario fails that scenario, in its own
 * words, and the check goes on: its message is the breach, not the stack of
 * the script that ran it.
 */
import { describe, expect, it } from "vitest";

import { breachesOrFailure, buildFailure, builtOrFailed } from "./built-or-failed.mjs";

describe("builtOrFailed", () => {
  it("gives what the bundler built", async () => {
    await expect(
      builtOrFailed("definitions", "vite", async () => ({ code: "x" })),
    ).resolves.toEqual({
      start: { code: "x" },
    });
  });

  it("gives the bundler's own message as the scenario's breach", async () => {
    const webpack = () => {
      throw new Error(
        "\nERROR in ./page.js 2:0-28\nModule not found: Error: Can't resolve 'ioredis'\n",
      );
    };

    await expect(builtOrFailed("direct caller", "webpack", webpack)).resolves.toEqual({
      breach:
        "direct caller does not build under webpack: ERROR in ./page.js 2:0-28\nModule not found: Error: Can't resolve 'ioredis'",
    });
  });

  it("tells a throw that is no error", () => {
    expect(buildFailure("definitions", "esbuild", "stopped")).toBe(
      "definitions does not build under esbuild: stopped",
    );
  });
});

describe("breachesOrFailure", () => {
  it("gives what a build that runs at once breaches, or its failure in the bundler's words", () => {
    expect(breachesOrFailure("the core's root", "Node", () => ["a breach"])).toEqual(["a breach"]);
    expect(
      breachesOrFailure("the core on the edge", "esbuild", () => {
        throw new Error(
          'Build failed with 1 error:\nlib/a.js:1:7: ERROR: Could not resolve "./b.js"',
        );
      }),
    ).toEqual([
      'the core on the edge does not build under esbuild: Build failed with 1 error:\nlib/a.js:1:7: ERROR: Could not resolve "./b.js"',
    ]);
  });
});
