/**
 * The core's build drops an import of one of its own modules that binds no
 * name: the one a constant of that module, written in place where it is
 * used, leaves behind, in a package that declares that its modules do
 * nothing as they load. The modules here are built one file each, as the
 * core's are.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "tsdown";
import { afterEach, describe, expect, it } from "vitest";

import { emptiedImports } from "../tsdown.emptied-imports";

/* A module whose constant another writes in place, that one, and one that loads another package. */
const SOURCES = {
  "separator.ts": [
    'export const SEPARATOR = ".";',
    "export function joined(names: string[]): string {",
    "  return names.join(SEPARATOR);",
    "}",
  ],
  "names.ts": [
    'import { SEPARATOR } from "./separator";',
    "export function names(path: string): string[] {",
    "  return path.split(SEPARATOR);",
    "}",
  ],
  "loads.ts": [
    'import "fixture-polyfill";',
    "export function loads(): boolean {",
    "  return true;",
    "}",
  ],
};

const made: string[] = [];

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

/* The modules built beside a manifest with what is given: each output file, by its name. */
async function built(manifest: Record<string, unknown>): Promise<Record<string, string>> {
  const root = mkdtempSync(join(tmpdir(), "courier-emptied-imports-"));
  made.push(root);
  mkdirSync(join(root, "src"));
  const dependencies = { "fixture-polyfill": "1.0.0" };
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", type: "module", dependencies, ...manifest }),
  );
  for (const [file, lines] of Object.entries(SOURCES)) {
    writeFileSync(join(root, "src", file), `${lines.join("\n")}\n`);
  }
  await build({
    config: false,
    cwd: root,
    entry: Object.keys(SOURCES).map((file) => `src/${file}`),
    unbundle: true,
    format: ["esm"],
    outDir: "lib",
    outExtensions: () => ({ js: ".js" }),
    dts: false,
    logLevel: "silent",
    plugins: [emptiedImports()],
  });
  return Object.fromEntries(
    Object.keys(SOURCES).map((file) => {
      const output = file.replace(/\.ts$/, ".js");
      return [output, readFileSync(join(root, "lib", output), "utf8")];
    }),
  );
}

describe("the imports the build leaves binding no name", () => {
  it("are dropped where a constant of another module is written in place", async () => {
    const lib = await built({ sideEffects: false });

    expect(lib["names.js"]).toContain('path.split(".")');
    expect(lib["names.js"]).not.toMatch(/\bimport\b/);
  });

  it("are kept where they load another package", async () => {
    const lib = await built({ sideEffects: false });

    expect(lib["loads.js"]).toMatch(/^import "fixture-polyfill";$/m);
  });

  it("stop the build of a package that does not declare its modules do nothing as they load", async () => {
    await expect(built({})).rejects.toThrow(/does not declare "sideEffects": false/);
  });
});
