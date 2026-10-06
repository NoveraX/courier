/**
 * Files Studio composes come out as the project's own formatter writes
 * them, with its configuration; a file a tool fails on keeps its text, and
 * the failure is said, never thrown.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findFormatters } from "../../src/server/project-format/find-formatters";
import { formatProjectFiles } from "../../src/server/project-format/format-project-files";

const INSIDE = fileURLToPath(
  new URL("../../../../node_modules/.cache/courier-format-tests/", import.meta.url),
);
const made: string[] = [];

function project(files: Record<string, string>, base = INSIDE): string {
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, "format-"));
  made.push(root);
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

const COMPOSED = [
  'import { z } from "zod";',
  'import { PetSchema, type Pet } from "./schemas";',
  'export const pets = { list: endpoint.get("").response<Pet[]>(z.array(PetSchema)), one: 1 };',
  "",
].join("\n");

describe("formatting files as the project formats its code", () => {
  it("formats with the project's Biome and its configuration, imports sorted", async () => {
    const root = project({
      "package.json": "{}",
      "biome.json": JSON.stringify({ formatter: { indentStyle: "tab", lineWidth: 60 } }),
    });

    const outcome = await formatProjectFiles(root, [{ path: "src/pets.ts", content: COMPOSED }]);
    const text = outcome.files[0]?.content ?? "";

    expect(outcome.formattedWith).toEqual([expect.stringMatching(/^Biome \d+\.\d+\.\d+/)]);
    expect(outcome.problem).toBeNull();
    expect(text).toContain('import { type Pet, PetSchema } from "./schemas";');
    expect(text).toContain("\tlist: endpoint");
  });

  it("formats with the project's Prettier and its configuration", async () => {
    const outside = mkdtempSync(join(tmpdir(), "courier-format-"));
    made.push(outside);
    const root = project(
      { "package.json": "{}", ".prettierrc": '{ "singleQuote": true }' },
      outside,
    );
    mkdirSync(join(root, "node_modules"));
    symlinkSync(join(dirname(dirname(INSIDE)), "prettier"), join(root, "node_modules", "prettier"));

    const outcome = await formatProjectFiles(root, [{ path: "src/pets.ts", content: COMPOSED }]);

    expect(outcome.formattedWith).toEqual([expect.stringMatching(/^Prettier \d+\.\d+\.\d+/)]);
    expect(outcome.files[0]?.content).toContain("import { z } from 'zod';");
  });

  it("keeps the text of a file a tool fails on, and says which and why", async () => {
    const root = project({ "package.json": "{}", "broken.cjs": "process.exit(3);" });
    const tool = { name: "Biome" as const, version: "0.0.0", bin: join(root, "broken.cjs") };
    const files = [{ path: "src/pets.ts", content: COMPOSED }];

    const outcome = await formatProjectFiles(root, files, { tools: [tool], missing: null });

    expect(outcome.files[0]?.content).toBe(COMPOSED);
    expect(outcome.problem).toBe("src/pets.ts was not formatted: Biome exited with 3");
  });

  it("leaves the files as composed in a project with no formatter", async () => {
    const files = [{ path: "src/pets.ts", content: COMPOSED }];

    const outcome = await formatProjectFiles("/nowhere", files, { tools: [], missing: null });

    expect(outcome).toEqual({ files, formattedWith: [], problem: null });
  });

  it("says a configured formatter is missing rather than formatting with another", async () => {
    const files = [{ path: "src/pets.ts", content: COMPOSED }];
    const missing = "Biome is configured but not installed";

    const outcome = await formatProjectFiles("/nowhere", files, { tools: [], missing });

    expect(outcome.problem).toBe(missing);
    expect(outcome.files[0]?.content).toBe(COMPOSED);
  });

  it("finds the formatters from the project root when not given", async () => {
    const root = project({ "package.json": "{}", "biome.json": "{}" });

    const outcome = await formatProjectFiles(root, [{ path: "a.ts", content: "const a  =  1\n" }]);

    expect(findFormatters(root).tools).toHaveLength(1);
    expect(outcome.files[0]?.content).toBe("const a = 1;\n");
  });
});
