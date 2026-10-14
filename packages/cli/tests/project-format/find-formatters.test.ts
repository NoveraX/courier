/**
 * Courier formats what it writes with the formatters the project uses, as
 * the project installed them: Biome where a Biome configuration or the
 * package declares it, Prettier where Prettier's does — after Biome only
 * when Biome's formatter is off.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { findFormatters } from "../../src/project-format/find-formatters";

/* Inside the repository, so the formatters it installed resolve as a project's would. */
const INSIDE = fileURLToPath(
  new URL("../../../../node_modules/.cache/courier-format-tests/", import.meta.url),
);

const made: string[] = [];

function project(files: Record<string, string>, base = INSIDE): string {
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, "find-"));
  made.push(root);
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
  return root;
}

/* Outside the repository, so no configuration of its own is found above the project;
   a package it lists is linked in from the repository's installation. */
function outside(files: Record<string, string>, installed: readonly string[] = []): string {
  const root = project(files, mkdtempSync(join(tmpdir(), "courier-format-")));
  made.push(dirname(root));
  for (const pkg of installed) {
    mkdirSync(join(root, "node_modules"), { recursive: true });
    symlinkSync(join(INSIDE, "..", "..", pkg), join(root, "node_modules", pkg));
  }
  return root;
}

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

const names = (root: string) => findFormatters(root).tools.map((tool) => tool.name);

describe("the formatters a project uses", () => {
  it("is Biome where a Biome configuration stands, as installed", () => {
    const root = project({ "package.json": "{}", "biome.json": "{}" });

    const { tools, missing } = findFormatters(root);

    expect(tools.map((tool) => tool.name)).toEqual(["Biome"]);
    expect(tools[0]?.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(missing).toBeNull();
  });

  it("is Prettier where a Prettier configuration stands and Biome does not", () => {
    const root = outside({ "package.json": "{}", ".prettierrc": "{}" }, ["prettier"]);

    expect(names(root)).toEqual(["Prettier"]);
  });

  it("is Prettier where the package declares it under `prettier`", () => {
    const root = outside({ "package.json": JSON.stringify({ prettier: { semi: false } }) }, [
      "prettier",
    ]);

    expect(names(root)).toEqual(["Prettier"]);
  });

  it("runs Prettier after Biome only when Biome's formatter is off", () => {
    const off = project({
      "package.json": "{}",
      "biome.jsonc": '{ // lint only\n "formatter": { "enabled": false } }',
      ".prettierrc": "{}",
    });
    const on = project({ "package.json": "{}", "biome.json": "{}", ".prettierrc": "{}" });

    expect(names(off)).toEqual(["Biome", "Prettier"]);
    expect(names(on)).toEqual(["Biome"]);
  });

  it("finds none for a project that formats with neither", () => {
    const root = outside({ "package.json": JSON.stringify({ name: "plain" }) }, ["prettier"]);

    expect(names(root)).toEqual([]);
    expect(findFormatters(root).missing).toBeNull();
  });

  it("says when the project configures a formatter it did not install", () => {
    const root = outside({ "package.json": "{}", "biome.json": "{}" });

    const { tools, missing } = findFormatters(root);

    expect(tools).toEqual([]);
    expect(missing).toBe("Biome is configured but not installed");
  });
});
