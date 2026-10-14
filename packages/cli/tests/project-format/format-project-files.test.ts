/**
 * Files Courier composes come out as the project's own formatter writes
 * them, with its configuration; a file a tool fails on keeps its text, and
 * the failure is said, never thrown.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findFormatters } from "../../src/project-format/find-formatters";
import { formatProjectFiles } from "../../src/project-format/format-project-files";
import { closeFormatProcesses } from "../../src/project-format/formatter-host";

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

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of made.splice(0)) {
    await closeFormatProcesses(root);
    rmSync(root, { recursive: true, force: true });
  }
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

  it("formats until the text stops changing, where one pass of Biome does not settle it", async () => {
    const root = project({
      "package.json": "{}",
      "biome.json": JSON.stringify({ formatter: { indentStyle: "space", lineWidth: 100 } }),
    });
    /* As the generator wrote an endpoint of OpenAI's specification: a comment inside a type argument. */
    const composed = [
      'import { z } from "zod";',
      'import { LiveCallAcceptRequestSchema, type LiveCallAcceptRequest } from "./schemas";',
      "",
      "export const live = {",
      '  acceptLiveSession: endpoint.post(":session_id/accept").variables<LiveCallAcceptRequest & { /** Opaque Live session identifier from the creation response or incoming-call webhook. Preserve the returned value unchanged, including its prefix. */ session_id: string }>(LiveCallAcceptRequestSchema.extend({ session_id: z.string() })),',
      "};",
      "",
    ].join("\n");

    const once = await formatProjectFiles(root, [{ path: "src/live.ts", content: composed }]);
    const again = await formatProjectFiles(root, once.files);

    expect(once.problem).toBeNull();
    expect(again.files[0]?.content).toBe(once.files[0]?.content);
  });

  it("keeps the text of a file a tool fails on, and says which and why", async () => {
    const root = project({ "package.json": "{}", "broken.cjs": "process.exit(3);" });
    const command = { program: process.execPath, prefix: [join(root, "broken.cjs")] };
    const tool = { name: "Biome" as const, version: "0.0.0", command };
    const files = [{ path: "src/pets.ts", content: COMPOSED }];

    const outcome = await formatProjectFiles(root, files, {
      tools: [tool],
      missing: null,
      stamp: "",
    });

    expect(outcome.files[0]?.content).toBe(COMPOSED);
    expect(outcome.problem).toBe("src/pets.ts was not formatted with Biome: it exited with 3");
  });

  it("names the project's formatter even when no file needs formatting", async () => {
    const tool = {
      name: "Biome" as const,
      version: "2.5.14",
      command: { program: "/nowhere/biome", prefix: [] },
    };

    const outcome = await formatProjectFiles("/nowhere", [], {
      tools: [tool],
      missing: null,
      stamp: "",
    });

    expect(outcome).toEqual({ files: [], formattedWith: ["Biome 2.5.14"], problem: null });
  });

  it("leaves the files as composed in a project with no formatter", async () => {
    const files = [{ path: "src/pets.ts", content: COMPOSED }];

    const outcome = await formatProjectFiles("/nowhere", files, {
      tools: [],
      missing: null,
      stamp: "",
    });

    expect(outcome).toEqual({ files, formattedWith: [], problem: null });
  });

  it("says a configured formatter is missing rather than formatting with another", async () => {
    const files = [{ path: "src/pets.ts", content: COMPOSED }];
    const missing = "Biome is configured but not installed";

    const outcome = await formatProjectFiles("/nowhere", files, { tools: [], missing, stamp: "" });

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
