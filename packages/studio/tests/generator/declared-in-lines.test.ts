/**
 * What a generated schemas or types module exports, as the generator
 * records it while it writes the module, without parsing it again: the
 * same names, in the same order and of the same kind as the module's own
 * syntax says, for every validator and every way an import can be written.
 * A description the specification wrote into a doc comment names nothing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { GenerateOptions, ParsedSpec } from "../../src/apis";
import { declaredInLines } from "../../src/apis/generator/declared-in-lines";
import { generateSchemasFile, generateTypesFile } from "../../src/apis/generator/generate-schemas";
import { applyImportDefaults } from "../../src/apis/generator/types";
import { resolveImportLayout } from "../../src/apis/layout";
import { parseSpec } from "../../src/apis/parser/parse-spec";
import { declaredExports } from "../helpers/declared-exports";

/* Every shape the generator writes: shared schemas, cycles, unions, enums,
   aliases, patterns, and descriptions that read like declarations. */
const KITCHEN_SINK = JSON.parse(
  JSON.stringify(
    parseSpec(
      readFileSync(new URL("../fixtures/generator/kitchen-sink.json", import.meta.url), "utf8"),
    ),
  ),
) as ParsedSpec;

describe("declaredInLines", () => {
  it("reads each declaration the generator writes, a value over a type of the same name", () => {
    const names = declaredInLines([
      "export type Pet = { id: string };",
      "export const PetSchema = z.object({});",
      "export const X: Y = z.lazy(() => s);",
      "export type X = { a: 1 };",
    ]);

    expect([...names]).toEqual([
      ["Pet", "type"],
      ["PetSchema", "value"],
      ["X", "value"],
    ]);
  });

  it("reads nothing a doc comment holds, however its lines read", () => {
    const names = declaredInLines([
      "/** A pet.\nexport const Fake = defineGroup({\nexport type AlsoFake = 1;\n */",
      "export type Pet = { id: string };",
    ]);

    expect([...names]).toEqual([["Pet", "type"]]);
  });

  it("reads no import, no helper and no declaration it does not export", () => {
    const names = declaredInLines([
      'import { z } from "zod";',
      "let declared = false;",
      "const local = 1;",
      "export { local };",
      "export type { Pet } from './pets';",
      "export const PetSchema = z.object({});",
    ]);

    expect([...names]).toEqual([["PetSchema", "value"]]);
  });
});

describe("what a generated module exports", () => {
  const settings: GenerateOptions[] = [];
  for (const validation of ["zod", "valibot", "arktype", "none"] as const) {
    for (const generateTypes of [true, false]) {
      /* Neither schemas nor types: the generator writes no such module. */
      if (validation === "none" && !generateTypes) continue;
      settings.push({ type: "openapi", outputDir: "src/api", validation, generateTypes });
    }
  }
  settings.push({
    type: "openapi",
    outputDir: "src/api",
    validation: "zod",
    generateSchemas: false,
  });
  settings.push({
    type: "openapi",
    outputDir: "src/api",
    validation: "none",
    generateSchemas: false,
    generateTypes: true,
  });
  settings.push({
    type: "openapi",
    outputDir: "src/api",
    validation: "zod",
    includeComments: false,
  });

  it.each(settings.map((options) => [JSON.stringify(options), options] as const))(
    "is what its syntax says, with %s",
    (_name, options) => {
      const resolved = applyImportDefaults(options, resolveImportLayout(options, "shop"));
      const write = resolved.generateSchemas ? generateSchemasFile : generateTypesFile;

      const module = write(KITCHEN_SINK.schemas, resolved);

      expect(module.declares.size).toBeGreaterThan(0);
      expect([...module.declares]).toEqual([...declaredExports(module.file.content)]);
    },
  );
});
