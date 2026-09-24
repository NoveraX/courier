import { describe, expect, it } from "vitest";

import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";
import { siteAboveFirstStatement } from "../../../src/server/mocks-edit/plan/site-above-first-statement";

function siteIn(text: string): number | null {
  return siteAboveFirstStatement(parseSource("x.ts", text));
}

describe("siteAboveFirstStatement", () => {
  it("is the first statement's line when nothing is attached to it", () => {
    expect(siteIn("const a = 1;\n")).toBe(0);
  });

  it.each([
    "// @ts-expect-error -- untyped\n",
    "// biome-ignore lint/style/noDefaultExport: Studio reads it\n",
    "// eslint-disable-next-line\n",
    "/**\n * Mocks for local development.\n */\n",
    "// one\n// two\n",
  ])("is above the comment run %j attached to the statement", (comments) => {
    expect(siteIn(`${comments}const helper = require("./helper");\n`)).toBe(0);
  });

  it.each([
    `/// <reference types="node" />\n`,
    `/// <amd-module name="mocks" />\n`,
    "// @ts-nocheck\n",
    "// @ts-check\n",
    "//@TS-NOCHECK\n",
    "/* @jsx h */\n",
    "/** @jsxImportSource preact */\n",
    "/**\n * @jsxRuntime classic\n */\n",
  ])("is below the pragma %j, which TypeScript reads only above the first statement", (pragma) => {
    const text = `${pragma}const helper = require("./helper");\n`;

    expect(siteIn(text)).toBe(pragma.length);
  });

  it("is below the last of several pragmas, and above the comment governing the statement", () => {
    const text = `/// <reference types="node" />\n// @ts-nocheck\n// @ts-expect-error\nfoo();\n`;

    expect(siteIn(text)).toBe(text.indexOf("// @ts-expect-error"));
  });

  it("is below a pragma a blank line sets apart, and a header above the pragma", () => {
    const text = "// header\n// @ts-nocheck\n\nfoo();\n";

    expect(siteIn(text)).toBe(text.indexOf("foo"));
  });

  it("is the statement itself when a block pragma precedes it on its line", () => {
    const text = "/* @jsx h */ foo();\n";

    expect(siteIn(text)).toBe(text.indexOf("foo"));
  });

  it.each([
    "// @ts-expect-error -- untyped\n",
    "// @ts-ignore\n",
    "// @ts-nocheck-ish\n",
    "/* @ts-nocheck */\n",
    "/** @type {import('x').Mocks} */\n",
    '// <reference types="node" />\n',
  ])("is above %j, which is not a file-wide pragma", (comment) => {
    expect(siteIn(`${comment}foo();\n`)).toBe(0);
  });

  it("is below the hashbang and a pragma after it", () => {
    const text = "#!/usr/bin/env node\n// @ts-nocheck\nfoo();\n";

    expect(siteIn(text)).toBe(text.indexOf("foo"));
  });

  it("is below a header comment a blank line sets apart", () => {
    const text = "// header\n\n// @ts-expect-error\nfoo();\n";

    expect(siteIn(text)).toBe(text.indexOf("// @ts-expect-error"));
  });

  it("is below the directive prologue, and a comment trailing it", () => {
    const text = `"use strict"; // strict mode\n// @ts-expect-error\nfoo();\n`;

    expect(siteIn(text)).toBe(text.indexOf("// @ts-expect-error"));
  });

  it("is below a hashbang, even with a comment attached right after it", () => {
    const text = "#!/usr/bin/env node\n// @ts-expect-error\nfoo();\n";

    expect(siteIn(text)).toBe(text.indexOf("// @ts-expect-error"));
  });

  it("is after a BOM", () => {
    expect(siteIn("\uFEFF// @ts-expect-error\nfoo();\n")).toBe(1);
  });

  it("is the statement itself when a directive precedes it on its line", () => {
    const text = `"use strict"; foo();\n`;

    expect(siteIn(text)).toBe(text.indexOf("foo"));
  });

  it("counts a lone CR as a line break between a comment and the statement", () => {
    expect(siteIn("// @ts-expect-error\rfoo();\r")).toBe(0);
    const text = "// header\r\r// @ts-expect-error\rfoo();\r";
    expect(siteIn(text)).toBe(text.indexOf("// @ts-expect-error"));
  });

  it("is null for a file with no statement besides directives", () => {
    expect(siteIn(`"use strict";\n// only a comment\n`)).toBeNull();
    expect(siteIn("")).toBeNull();
  });
});
