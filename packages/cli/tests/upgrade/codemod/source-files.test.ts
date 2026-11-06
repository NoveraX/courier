import { afterAll, describe, expect, it } from "vitest";

import {
  codePieces,
  projectCode,
  writtenByStudio,
} from "../../../src/upgrade/codemod/source-files";
import { UPGRADE_LIMITS } from "../../../src/upgrade/limits";
import { projectWith, removeProjects } from "../../helpers/temp-project";

afterAll(removeProjects);

const NAMES = 'import { createCaller } from "@noverax/courier";\n';

describe("projectCode", () => {
  it("reads the files that name Courier's packages, leaving out installed packages, builds' output and dot folders", () => {
    const root = projectWith({
      "src/api.ts": NAMES,
      "src/plain.ts": "export const x = 1;\n",
      "app/page.tsx": NAMES,
      "README.md": NAMES,
      "node_modules/@noverax/courier/index.js": NAMES,
      "dist/api.js": NAMES,
      ".next/server.js": NAMES,
    });

    expect(
      projectCode(root)
        .files.map((file) => file.path)
        .sort(),
    ).toEqual(["app/page.tsx", "src/api.ts"]);
  });

  it("names a file too large to read, and reads no more of it", () => {
    const root = projectWith({
      "src/huge.ts": `${NAMES}${"x".repeat(UPGRADE_LIMITS.sourceBytes)}`,
    });

    const code = projectCode(root);

    expect(code.files).toEqual([]);
    expect(code.unread).toEqual([
      { path: "src/huge.ts", why: "it is 2.0 MiB, past the 2 MiB an upgrade reads" },
    ]);
    expect(code.stopped).toBe(false);
  });
});

describe("writtenByStudio", () => {
  it("is a file whose first line is Studio's header, as Studio reads it", () => {
    const header = (json: string) => `// @courier-generated ${json}`;
    const hash = "0123456789abcdef".repeat(4);

    expect(writtenByStudio(`${header(`{"import":"pets","sha256":"${hash}"}`)}\n${NAMES}`)).toBe(
      true,
    );
    expect(writtenByStudio(`${header(`{"import":"pets","sha256":"${hash}"}`)}\r\n${NAMES}`)).toBe(
      true,
    );
    expect(writtenByStudio(header(`{"import":"pets","sha256":"${hash}"}`))).toBe(true);
    expect(writtenByStudio(`${header(`{"import":"pets"}`)}\n${NAMES}`)).toBe(false);
    expect(
      writtenByStudio(`${header(`{"import":"pets","sha256":"${hash.toUpperCase()}"}`)}\n`),
    ).toBe(false);
    expect(writtenByStudio(`${header("{import: pets}")}\n${NAMES}`)).toBe(false);
    expect(writtenByStudio(`${NAMES}${header(`{"import":"pets","sha256":"${hash}"}`)}\n`)).toBe(
      false,
    );
  });
});

describe("codePieces", () => {
  it("is a module whole, and each script block of a component's file where it starts", () => {
    const vue = `<template><p>Hi</p></template>\n<script setup lang="ts">\n${NAMES}</script>\n`;
    const astro = `---\n${NAMES}---\n<p>Hi</p>\n<script>\n${NAMES}</script>\n`;

    expect(codePieces("src/api.ts", NAMES)).toEqual([
      { path: "src/api.ts", text: NAMES, offset: 0, parseAs: ".ts" },
    ]);
    const [script] = codePieces("src/App.vue", vue);
    expect(script?.parseAs).toBe(".ts");
    expect(vue.slice(script?.offset, (script?.offset ?? 0) + (script?.text.length ?? 0))).toBe(
      `\n${NAMES}`,
    );
    expect(codePieces("src/page.astro", astro).map((piece) => piece.parseAs)).toEqual([
      ".ts",
      ".ts",
    ]);
    expect(codePieces("src/Page.svelte", `<script>\n${NAMES}</script>`)[0]?.parseAs).toBe(".js");
  });
});
