/**
 * The Studio esbuild and Rollup plugins, driven through the real bundlers.
 *
 * The esbuild plugin failed the user's build outright: its virtual module had
 * no directory to resolve the runtime from. The Rollup plugin added nothing
 * whenever @rollup/plugin-commonjs was in the chain, which loads every entry
 * while resolving it — before Rollup has marked it as an entry.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { build } from "esbuild";
import { rollup } from "rollup";
import { afterEach, describe, expect, it } from "vitest";

import { courierStudio as esbuildStudio } from "../src/plugins/esbuild";
import { courierStudio as rollupStudio } from "../src/plugins/rollup";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * An app entry outside the repository, so the runtime resolves only the way it
 * must for an app that does not list it: through the Studio package.
 */
function entry(): string {
  const dir = mkdtempSync(join(tmpdir(), "courier-bundle-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "main.js");
  writeFileSync(file, 'console.log("app");\n');
  return file;
}

describe("courierStudio() for esbuild", () => {
  it("bundles the connection ahead of the entry", async () => {
    const result = await build({
      entryPoints: [entry()],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      logLevel: "silent",
      plugins: [esbuildStudio({ enabled: true })],
    });

    const code = result.outputFiles[0]?.text ?? "";
    expect(code).toContain('attachRuntime("esbuild-browser")');
    expect(code.indexOf("attachRuntime(")).toBeLessThan(code.indexOf('console.log("app")'));
  });
});

describe("courierStudio() for Rollup", () => {
  it("bundles the connection ahead of the entry with the commonjs plugin in the chain", async () => {
    const bundle = await rollup({
      input: entry(),
      plugins: [rollupStudio({ enabled: true }), nodeResolve({ browser: true }), commonjs()],
      onwarn: () => {},
    });
    cleanups.push(() => void bundle.close());

    const { output } = await bundle.generate({ format: "es", inlineDynamicImports: true });

    const code = output[0].code;
    expect(code).toContain('attachRuntime("rollup-browser")');
    expect(code.indexOf("attachRuntime(")).toBeLessThan(code.indexOf('console.log("app")'));
  });
});
