/**
 * An import's `include` and `exclude` as courier.config.ts holds them: in
 * the lines Studio gives to add by hand, and in the entry it writes into
 * the config, quoted as the config quotes its strings.
 */
import type { CourierImportEntry } from "@noverax/courier/config";
import { describe, expect, it } from "vitest";

import { importEntry } from "../../src/server/config-edit/render-config-entries";
import { formatImportSnippet } from "../../src/server/format-import-snippet";
import { selectorText } from "../../src/server/selector-text";

const entry: CourierImportEntry = {
  importType: "file",
  type: "openapi",
  outputDir: "src/api",
  include: { operationIds: ["getUser"], tags: ["pets"] },
  exclude: { paths: ["/pets/{id}"] },
};

describe("a selector's text", () => {
  it("lists tags, paths and operationIds in that order, each value quoted as asked", () => {
    expect(
      selectorText({ operationIds: ["getUser"], tags: ["pets", "store"] }, JSON.stringify),
    ).toBe('{ tags: ["pets", "store"], operationIds: ["getUser"] }');
    expect(selectorText({ paths: ["/a"] }, (value) => `'${value}'`)).toBe("{ paths: ['/a'] }");
  });

  it("is written in the lines to add by hand, after the codegen choices", () => {
    expect(formatImportSnippet("pets", { ...entry, validation: "valibot" }).split("\n")).toEqual([
      '  "pets": {',
      '    importType: "file",',
      '    type: "openapi",',
      '    outputDir: "src/api",',
      '    validation: "valibot",',
      '    include: { tags: ["pets"], operationIds: ["getUser"] },',
      '    exclude: { paths: ["/pets/{id}"] },',
      "  },",
    ]);
  });

  it("is written into the config in its own quotes", () => {
    const style = {
      eol: "\n",
      quote: "'",
      semicolons: false,
      indent: "  ",
      trailingCommas: true,
    } as const;

    expect(importEntry("pets", entry, style)("", false)).toBe(
      "pets: { importType: 'file', type: 'openapi', outputDir: 'src/api', include: { tags: ['pets'], operationIds: ['getUser'] }, exclude: { paths: ['/pets/{id}'] } }",
    );
  });
});
