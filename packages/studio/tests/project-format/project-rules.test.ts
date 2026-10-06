/**
 * Studio writes files by the rules the project keeps: its ESLint's fixes
 * and its Prettier's layout, each loaded once in a thread kept for the
 * project, its Biome run as its own program. A project with no rules gets
 * its files as Studio composed them.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { findFormatters } from "../../src/server/project-format/find-formatters";
import { formatProjectFiles } from "../../src/server/project-format/format-project-files";
import { closeFormatterThread } from "../../src/server/project-format/formatter-host";

const INSTALLED = fileURLToPath(new URL("../../../../node_modules/", import.meta.url));
const made: string[] = [];

/* A project outside the repository, so no configuration of the repository's is found
   above it, with the packages named linked in from the repository's installation. */
function project(files: Record<string, string>, installed: readonly string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), "courier-rules-"));
  made.push(root);
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
  mkdirSync(join(root, "node_modules"), { recursive: true });
  for (const pkg of installed) symlinkSync(join(INSTALLED, pkg), join(root, "node_modules", pkg));
  return root;
}

afterEach(async () => {
  for (const root of made.splice(0)) {
    await closeFormatterThread(root);
    rmSync(root, { recursive: true, force: true });
  }
});

const ESLINT_RULES = `export default [
  { ignores: ["src/vendor/**"] },
  { files: ["**/*.ts"], rules: { "no-var": "error", "prefer-const": "error", "object-shorthand": "error" } },
];
`;
const COMPOSED = 'var name = "pets";\nconst pets = { name: name };\nexport { pets };\n';

describe("the tools a project keeps its rules in", () => {
  it("find ESLint where its configuration stands, as installed, and Biome as its own program", () => {
    const eslint = project({ "package.json": "{}", "eslint.config.mjs": ESLINT_RULES }, ["eslint"]);
    const biome = project({ "package.json": "{}", "biome.json": "{}" }, ["@biomejs"]);

    const [linter] = findFormatters(eslint).tools;
    const [formatter] = findFormatters(biome).tools;

    expect(linter).toMatchObject({ name: "ESLint", version: expect.stringMatching(/^\d+\./) });
    expect(formatter?.name === "Biome" && basename(formatter.command.program)).toMatch(/^biome/);
    expect(formatter?.name === "Biome" && formatter.command.prefix).toEqual([]);
  });

  it("say an ESLint the project configures but did not install is missing", () => {
    const root = project({ "package.json": "{}", "eslint.config.mjs": ESLINT_RULES });

    expect(findFormatters(root)).toMatchObject({
      tools: [],
      missing: "ESLint is configured but not installed",
    });
  });
});

describe("files written by the project's rules", () => {
  it("take ESLint's fixes, by the project's own rules", async () => {
    const root = project({ "package.json": "{}", "eslint.config.mjs": ESLINT_RULES }, ["eslint"]);

    const outcome = await formatProjectFiles(root, [{ path: "src/pets.ts", content: COMPOSED }]);

    expect(outcome.problem).toBeNull();
    expect(outcome.formattedWith).toEqual([expect.stringMatching(/^ESLint \d+\./)]);
    expect(outcome.files[0]?.content).toBe(
      'const name = "pets";\nconst pets = { name };\nexport { pets };\n',
    );
  });

  it("take ESLint's fixes, then Prettier's layout, where the project keeps both", async () => {
    const root = project(
      {
        "package.json": "{}",
        "eslint.config.mjs": ESLINT_RULES,
        ".prettierrc": '{ "singleQuote": true }',
      },
      ["eslint", "prettier"],
    );

    const outcome = await formatProjectFiles(root, [{ path: "src/pets.ts", content: COMPOSED }]);

    expect(outcome.formattedWith).toEqual([
      expect.stringMatching(/^ESLint /),
      expect.stringMatching(/^Prettier /),
    ]);
    expect(outcome.files[0]?.content).toBe(
      "const name = 'pets';\nconst pets = { name };\nexport { pets };\n",
    );
  });

  it("leave a file the project's ESLint ignores as it is", async () => {
    const root = project({ "package.json": "{}", "eslint.config.mjs": ESLINT_RULES }, ["eslint"]);

    const outcome = await formatProjectFiles(root, [
      { path: "src/vendor/pets.ts", content: COMPOSED },
    ]);

    expect(outcome.problem).toBeNull();
    expect(outcome.files[0]?.content).toBe(COMPOSED);
  });

  it("keep a file ESLint cannot read as composed, and say why", async () => {
    const root = project({ "package.json": "{}", "eslint.config.mjs": ESLINT_RULES }, ["eslint"]);
    const typed = "export const pets: string[] = [];\n";

    const outcome = await formatProjectFiles(root, [{ path: "src/pets.ts", content: typed }]);

    expect(outcome.files[0]?.content).toBe(typed);
    expect(outcome.problem).toMatch(
      /^src\/pets\.ts was not formatted with ESLint: it cannot read the file: /,
    );
  });

  it("follow a configuration changed since the last files were written", async () => {
    const root = project({ "package.json": "{}", ".prettierrc": '{ "singleQuote": true }' }, [
      "prettier",
    ]);
    const files = [{ path: "src/a.ts", content: 'export const a = "a";\n' }];
    const before = await formatProjectFiles(root, files);

    writeFileSync(join(root, ".prettierrc"), '{ "singleQuote": false, "semi": false }');
    utimesSync(join(root, ".prettierrc"), new Date(), new Date(Date.now() + 5_000));
    const after = await formatProjectFiles(root, files);

    expect(before.files[0]?.content).toBe("export const a = 'a';\n");
    expect(after.files[0]?.content).toBe('export const a = "a"\n');
  });
});
