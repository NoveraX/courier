/**
 * A mocks file Studio creates is written as the project formats its code;
 * an edit to the user's own file is left as planned, as it only inserts,
 * in the file's own style.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { formattedCreation } from "../../src/server/mocks-edit/formatted-creation";
import type { MocksPlan } from "../../src/server/mocks-edit/plan/types";
import { closeFormatterThread } from "../../src/server/project-format/formatter-host";

const INSTALLED = fileURLToPath(new URL("../../../../node_modules/", import.meta.url));
const made: string[] = [];

function project(files: Record<string, string>, installed: readonly string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), "courier-mocks-format-"));
  made.push(root);
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
  mkdirSync(join(root, "node_modules"));
  for (const pkg of installed) symlinkSync(join(INSTALLED, pkg), join(root, "node_modules", pkg));
  return root;
}

afterEach(async () => {
  for (const root of made.splice(0)) {
    await closeFormatterThread(root);
    rmSync(root, { recursive: true, force: true });
  }
});

const TEXT =
  'import { defineMocks } from "@noverax/courier-mock";\nexport default defineMocks({ api: x });\n';
const plan = (creates: boolean): MocksPlan => ({
  text: TEXT,
  edits: [{ start: 0, end: 0, text: TEXT }],
  literalKeys: [],
  creates,
  configSpecifier: "./courier.config",
});

describe("a mocks file Studio plans", () => {
  it("is formatted with the project's tools when Studio creates it", async () => {
    const root = project({ "package.json": "{}", ".prettierrc": '{ "singleQuote": true }' }, [
      "prettier",
    ]);

    const { plan: formatted, formatting } = await formattedCreation(
      root,
      "courier.mocks.ts",
      plan(true),
    );

    expect(formatted.text).toContain("from '@noverax/courier-mock';");
    expect(formatted.edits).toEqual([{ start: 0, end: 0, text: formatted.text }]);
    expect(formatting).toEqual({
      formattedWith: [expect.stringMatching(/^Prettier /)],
      problem: null,
    });
  });

  it("is left as composed in a project with no tools", async () => {
    const root = project({ "package.json": "{}" });

    const outcome = await formattedCreation(root, "courier.mocks.ts", plan(true));

    expect(outcome).toEqual({ plan: plan(true), formatting: { formattedWith: [], problem: null } });
  });

  it("is left as planned when Studio edits the user's own file", async () => {
    const root = project({ "package.json": "{}", ".prettierrc": "{}" }, ["prettier"]);

    const outcome = await formattedCreation(root, "courier.mocks.ts", plan(false));

    expect(outcome).toEqual({ plan: plan(false), formatting: null });
  });
});
