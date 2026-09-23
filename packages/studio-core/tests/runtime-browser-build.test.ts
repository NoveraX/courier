/**
 * The runtime as a browser bundler sees it: through the package's exports,
 * under the `browser` condition.
 *
 * The one build of `./runtime` served browsers and servers alike, and its
 * server path imports the courier.config loader. A browser bundler follows
 * that import even though a browser never takes the path, into jiti and
 * `node:module` — so a production build of an Angular app that called
 * `setupCourierStudio()` failed outright.
 */
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("@noverax/courier-studio-core/runtime in a browser build", () => {
  it("bundles without reaching the disk config loader or any Node built-in", async () => {
    const result = await build({
      stdin: {
        contents: 'import { attachRuntime } from "@noverax/courier-studio-core/runtime"; attachRuntime();',
        resolveDir: __dirname,
      },
      bundle: true,
      write: false,
      metafile: true,
      platform: "browser",
      format: "esm",
      logLevel: "silent",
    });

    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.filter((path) => /load-config|jiti/.test(path))).toEqual([]);
    expect(inputs.some((path) => path.endsWith("runtime/browser.js"))).toBe(true);
  });
});
