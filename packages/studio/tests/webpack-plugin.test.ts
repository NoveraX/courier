/**
 * The Studio webpack plugin, against a compiler holding webpack's normalized
 * entries, and through a real webpack build.
 *
 * It decided by `NODE_ENV` alone, which `webpack --mode production` does not
 * set, so a production bundle carried the connection and dialled a Studio
 * that was not there on every page load.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { courierStudio as webpackStudio } from "../src/plugins/webpack";

type EntryFunction = () => Promise<Record<string, unknown>>;

interface WebpackStats {
  hasErrors(): boolean;
  toString(options: string): string;
}

interface WebpackCompiler {
  run(callback: (error: Error | null, stats?: WebpackStats) => void): void;
  close(callback: () => void): void;
}

type Webpack = (options: Record<string, unknown>) => WebpackCompiler;

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** webpack 5 as Next.js ships it, the one copy the workspace installs. */
function loadWebpack(): Webpack {
  const require = createRequire(import.meta.url);
  const load = require("next/dist/compiled/webpack/bundle5") as () => { webpack: Webpack };
  return load().webpack;
}

/**
 * Builds an app outside the repository with the plugin at its defaults and
 * returns every file webpack wrote, joined. Minimizing is off: Next.js's copy
 * finds its minimizer only inside Next.js, and what gets bundled is the same
 * either way.
 */
async function bundle(mode: "development" | "production" | undefined): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "courier-webpack-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "main.js"), 'console.log("app");\n');
  const output = join(dir, "out");
  const compiler = loadWebpack()({
    ...(mode === undefined ? {} : { mode }),
    context: dir,
    entry: { main: "./main.js" },
    output: { path: output },
    devtool: false,
    optimization: { minimize: false },
    performance: { hints: false },
    plugins: [webpackStudio()],
  });
  const stats = await new Promise<WebpackStats | undefined>((resolve, reject) => {
    compiler.run((error, result) => (error ? reject(error) : resolve(result)));
  });
  await new Promise<void>((resolve) => compiler.close(resolve));
  if (stats?.hasErrors()) throw new Error(stats.toString("errors-only"));
  return readdirSync(output)
    .map((file) => readFileSync(join(output, file), "utf-8"))
    .join("\n");
}

describe("courierStudio() for webpack", () => {
  it("connects the main entry in webpack's normalized form", async () => {
    const compiler = {
      options: {
        entry: { main: { import: ["./src/main.js"] } } as unknown,
        mode: "development",
        target: "web",
      },
    };

    webpackStudio({ enabled: true }).apply(compiler);
    const entries = await (compiler.options.entry as EntryFunction)();

    const main = entries.main as { import: string[] };
    expect(main.import).toHaveLength(2);
    expect(main.import[1]).toBe("./src/main.js");
  });

  it("connects a development build", async () => {
    const code = await bundle("development");

    expect(code).toContain('Symbol.for("courier.studio.url")');
    expect(code).toContain('"webpack-browser"');
  });

  it("leaves a production build unconnected", async () => {
    const code = await bundle("production");

    expect(code).toContain('console.log("app")');
    expect(code).not.toContain("courier.studio.url");
    expect(code).not.toContain("attachRuntime");
  });

  it("leaves a build without a mode unconnected, as webpack builds it for production", async () => {
    const code = await bundle(undefined);

    expect(code).toContain('console.log("app")');
    expect(code).not.toContain("courier.studio.url");
    expect(code).not.toContain("attachRuntime");
  });
});
