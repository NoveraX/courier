import { parseSource } from "@noverax/courier-cli/devkit";
import type { Comment } from "oxc-parser";
import { describe, expect, it } from "vitest";
import { isFilePragma } from "../../../src/server/mocks-edit/plan/is-file-pragma";

function commentOf(text: string): Comment {
  const [comment] = parseSource("x.ts", `${text}\nfoo();\n`).comments;
  if (comment === undefined) throw new Error("the fixture must hold a comment");
  return comment;
}

describe("isFilePragma", () => {
  it.each([
    `/// <reference types="node" />`,
    `/// <reference path="./globals.d.ts" />`,
    `/// <reference lib="dom" />`,
    `/// <amd-module name="mocks" />`,
    `/// <amd-dependency path="legacy" />`,
    `///<REFERENCE types="node" />`,
  ])("reads the triple-slash directive %s as one", (text) => {
    expect(isFilePragma(commentOf(text))).toBe(true);
  });

  it.each([
    "// @ts-nocheck",
    "// @ts-check",
    "//@ts-nocheck",
    "/// @ts-check",
    "// @ts-nocheck: generated",
    "// @TS-CHECK",
  ])("reads %s as one", (text) => {
    expect(isFilePragma(commentOf(text))).toBe(true);
  });

  it.each([
    "/* @jsx h */",
    "/** @jsxFrag Fragment */",
    "/** @jsxImportSource preact */",
    "/**\n * Mocks.\n * @jsxRuntime classic\n */",
  ])("reads the JSX pragma in %j as one", (text) => {
    expect(isFilePragma(commentOf(text))).toBe(true);
  });

  it.each([
    "// @ts-expect-error -- untyped",
    "// @ts-ignore",
    "// biome-ignore lint/style/noDefaultExport: Studio reads it",
    "// eslint-disable-next-line",
    "// @ts-nocheck-later",
    "/* @ts-nocheck */",
    "// @jsx h",
    "/** @type {import('x').Mocks} */",
    "/** @jsxfoo h */",
    '//// <reference types="node" />',
    '// <reference types="node" />',
    "/// <summary>Mocks</summary>",
  ])("does not read %s as one", (text) => {
    expect(isFilePragma(commentOf(text))).toBe(false);
  });
});
