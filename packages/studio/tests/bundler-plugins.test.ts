/**
 * The Studio esbuild and Rollup plugins, driven through the real bundlers.
 *
 * The esbuild plugin failed the user's build outright: its virtual module had
 * no directory to resolve the runtime from. The Rollup plugin added nothing
 * whenever @rollup/plugin-commonjs was in the chain, which loads every entry
 * while resolving it — before Rollup has marked it as an entry.
 *
 * Both decided by `NODE_ENV` alone, which neither bundler sets, so a minified
 * esbuild build and a one-off `rollup -c` shipped the connection, which then
 * dialled a Studio that was not there on every page load.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { build } from "esbuild";
import { type RollupWatcherEvent, rollup, watch } from "rollup";
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

async function esbuildBundle(options: Parameters<typeof build>[0]): Promise<string> {
  const result = await build({
    entryPoints: [entry()],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    logLevel: "silent",
    plugins: [esbuildStudio()],
    ...options,
  });
  return result.outputFiles?.[0]?.text ?? "";
}

/** A Rollup watch build of an app, the way `rollup -c -w` runs one. */
async function rollupWatchBundle(): Promise<string> {
  const file = entry();
  const output = join(file, "..", "out.js");
  const watcher = watch({
    input: file,
    output: { file: output, format: "es", inlineDynamicImports: true },
    plugins: [rollupStudio(), nodeResolve({ browser: true }), commonjs()],
    onwarn: () => {},
  });
  try {
    await new Promise<void>((resolve, reject) => {
      watcher.on("event", (event: RollupWatcherEvent) => {
        if (event.code === "BUNDLE_END") void event.result.close();
        if (event.code === "END") resolve();
        if (event.code === "ERROR") reject(event.error);
      });
    });
  } finally {
    await watcher.close();
  }
  return readFileSync(output, "utf-8");
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

  it("connects a development build", async () => {
    const code = await esbuildBundle({});

    expect(code).toContain('attachRuntime("esbuild-browser")');
  });

  it("leaves a minified build unconnected, as esbuild builds it for production", async () => {
    const code = await esbuildBundle({ minify: true });

    expect(code).toContain('console.log("app")');
    expect(code).not.toContain("courier.studio.url");
  });

  it("leaves unconnected a build that defines NODE_ENV as production", async () => {
    const code = await esbuildBundle({ define: { "process.env.NODE_ENV": '"production"' } });

    expect(code).toContain('console.log("app")');
    expect(code).not.toContain("courier.studio.url");
  });

  it("connects a minified build that defines NODE_ENV as development", async () => {
    const code = await esbuildBundle({
      minify: true,
      define: { "process.env.NODE_ENV": '"development"' },
    });

    expect(code).toContain("courier.studio.url");
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

  it("connects a watch build", async () => {
    const code = await rollupWatchBundle();

    expect(code).toContain('attachRuntime("rollup-browser")');
  });

  it("leaves a one-off build unconnected, as rollup -c runs it", async () => {
    const bundle = await rollup({
      input: entry(),
      plugins: [rollupStudio(), nodeResolve({ browser: true }), commonjs()],
      onwarn: () => {},
    });
    cleanups.push(() => void bundle.close());

    const { output } = await bundle.generate({ format: "es", inlineDynamicImports: true });

    expect(output[0].code).toContain('console.log("app")');
    expect(output[0].code).not.toContain("courier.studio.url");
  });
});
