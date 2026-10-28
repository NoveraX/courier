/**
 * @vitest-environment node
 *
 * The files of the ES modules Node resolves itself, noted with the hooks
 * Node runs as it resolves them, and with the ones a Node before 22.15 runs
 * on its loader's own thread, whose notes are in once they settle. Each
 * runs in a Node process of its own, which resolves the modules itself, as
 * the process reading a config does.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ResolveHooks } from "../../src/engine/note-resolved-files";

const SOURCE = pathToFileURL(
  resolve(import.meta.dirname, "../../src/engine/note-resolved-files.ts"),
);

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-resolved-files-")));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/* An ES module that imports another, as definitions split over files do. */
function modules(): { entry: string; imported: string } {
  const entry = join(dir, "entry.mjs");
  const imported = join(dir, "imported.mjs");
  writeFileSync(imported, "export const shop = 1;\n");
  writeFileSync(entry, 'export { shop } from "./imported.mjs";\n');
  return { entry, imported };
}

/* The files a process noted while it imported the entry, with the hooks named. */
function notedImporting(entry: string, hooks: ResolveHooks): string[] {
  const script = `import { noteResolvedFiles } from ${JSON.stringify(SOURCE.href)};
const noted = new Set();
const resolved = noteResolvedFiles(noted, ${JSON.stringify(hooks)});
await import(${JSON.stringify(pathToFileURL(entry).href)});
await resolved.settled();
process.stdout.write(JSON.stringify([...noted]));`;
  const output = execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
    { encoding: "utf8" },
  );
  return JSON.parse(output) as string[];
}

describe("noteResolvedFiles", () => {
  it.skipIf(typeof nodeModule.registerHooks !== "function")(
    "notes each ES module as Node resolves it, with Node's synchronous hooks",
    () => {
      const { entry, imported } = modules();

      expect(notedImporting(entry, "sync")).toEqual(expect.arrayContaining([entry, imported]));
    },
  );

  it("notes them with hooks on the loader's thread, as a Node before 22.15 has, once settled", () => {
    const { entry, imported } = modules();

    expect(notedImporting(entry, "async")).toEqual(expect.arrayContaining([entry, imported]));
  });
});
