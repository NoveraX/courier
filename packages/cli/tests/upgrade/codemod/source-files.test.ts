import { symlinkSync } from "node:fs";
import { join } from "node:path";
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
      { path: "src/huge.ts", why: "it is 2.0 MiB, past the 2 MiB an upgrade reads", folder: false },
    ]);
    expect(code.stopped).toBe(false);
  });

  it("leaves out what a build writes at a package's root only, and reads the folders of that name below it", () => {
    const root = projectWith({
      "package.json": "{}\n",
      "app/build/page.tsx": NAMES,
      "app/coverage/route.ts": NAMES,
      "src/dist/api.ts": NAMES,
      "build/server.js": NAMES,
      "coverage/report.js": NAMES,
      "packages/ui/package.json": "{}\n",
      "packages/ui/dist/index.js": NAMES,
      "packages/ui/src/index.ts": NAMES,
    });

    expect([...projectCode(root).paths].sort()).toEqual([
      "app/build/page.tsx",
      "app/coverage/route.ts",
      "packages/ui/src/index.ts",
      "src/dist/api.ts",
    ]);
  });

  it("reads folders whose names start with a dot, but a version control's and a framework's output at a package's root", () => {
    const root = projectWith({
      "package.json": "{}\n",
      "app/.server/caller.ts": NAMES,
      "app/.client/panel.ts": NAMES,
      ".storybook/preview.tsx": NAMES,
      ".git/hooks/commit.js": NAMES,
      ".next/server/page.js": NAMES,
      "apps/web/package.json": "{}\n",
      "apps/web/.nuxt/app.js": NAMES,
      "apps/web/.jj/store.js": NAMES,
    });

    expect([...projectCode(root).paths].sort()).toEqual([
      ".storybook/preview.tsx",
      "app/.client/panel.ts",
      "app/.server/caller.ts",
    ]);
  });

  it("reads a linked folder once, by its own path, and names a link out of the workspace", () => {
    const outside = projectWith({ "api.ts": NAMES });
    const root = projectWith({
      "package.json": "{}\n",
      "packages/shared/src/api.ts": NAMES,
      "apps/web/app/page.tsx": NAMES,
    });
    /* A junction on Windows, which links a folder without the rights a symbolic link needs there. */
    const linkFolder = (target: string, path: string) =>
      symlinkSync(target, join(root, path), "junction");
    linkFolder(join(root, "packages/shared/src"), "apps/web/shared");
    linkFolder(outside, "apps/web/outside");
    linkFolder(join(root, "packages/shared"), "packages/shared/src/loop");
    const fileLinks = process.platform !== "win32";
    if (fileLinks)
      symlinkSync("../../packages/shared/src/api.ts", join(root, "apps/web/api.ts"), "file");

    const code = projectCode(root);

    expect([...code.paths].sort()).toEqual(["apps/web/app/page.tsx", "packages/shared/src/api.ts"]);
    expect([...code.links].sort()).toEqual([
      ...(fileLinks ? [["apps/web/api.ts", "packages/shared/src/api.ts"]] : []),
      ["apps/web/shared", "packages/shared/src"],
      ["packages/shared/src/loop", "packages/shared"],
    ]);
    expect(code.unread).toEqual([
      { path: "apps/web/outside", why: "it links out of the workspace", folder: true },
    ]);
  });

  it("names a folder deeper than an upgrade walks", () => {
    const deep = Array.from({ length: UPGRADE_LIMITS.sourceDepth + 1 }, (_, at) => `d${at}`);
    const root = projectWith({ [`${deep.join("/")}/api.ts`]: NAMES, "src/api.ts": NAMES });

    const code = projectCode(root);

    expect(code.paths).toEqual(["src/api.ts"]);
    expect(code.unread).toEqual([
      {
        path: deep.join("/"),
        why: `it is deeper than the ${UPGRADE_LIMITS.sourceDepth} folders an upgrade walks`,
        folder: true,
      },
    ]);
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
  it("is a module whole, and each script block of a component's file where it starts, each of its kind", () => {
    const vue = `<template><p>Hi</p></template>\n<script setup lang="ts">\n${NAMES}</script>\n`;
    const astro = `---\n${NAMES}---\n<p>Hi</p>\n<script>\n${NAMES}</script>\n`;

    expect(codePieces("src/api.ts", NAMES)).toEqual([
      { path: "src/api.ts", text: NAMES, offset: 0, parseAs: ".ts", kind: "module" },
    ]);
    const [script] = codePieces("src/App.vue", vue);
    expect(script?.parseAs).toBe(".ts");
    expect(script?.kind).toBe("script");
    expect(vue.slice(script?.offset, (script?.offset ?? 0) + (script?.text.length ?? 0))).toBe(
      `\n${NAMES}`,
    );
    expect(codePieces("src/page.astro", astro).map((piece) => [piece.kind, piece.parseAs])).toEqual(
      [
        ["frontmatter", ".ts"],
        ["script", ".ts"],
      ],
    );
    expect(codePieces("src/Page.svelte", `<script>\n${NAMES}</script>`)[0]?.parseAs).toBe(".js");
  });
});
