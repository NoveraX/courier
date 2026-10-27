/**
 * The specification a declared import is generated from, made by its
 * transform from a copy of the one parsed: copied through its JSON text,
 * which no depth the parser reads stops, as structuredClone's recursion did
 * some 700 objects deep — every update of such an import failed there.
 */
import type { CourierImportEntry } from "@noverax/courier/config";
import { describe, expect, it } from "vitest";

import type { ParsedSchema, ParsedSpec } from "../src/apis/parser/types";
import { jsonText } from "../src/apis/registry/json-text";
import { specAsDeclared } from "../src/server/spec-as-declared";

function deep(levels: number): ParsedSpec {
  let schema: ParsedSchema = { name: "Leaf", type: "string" };
  for (let at = 0; at < levels; at += 1) {
    schema = {
      name: `Level${at}`,
      type: "object",
      properties: { next: { required: false, type: "object", shape: schema } },
      required: [],
    };
  }
  return {
    title: "Deep",
    version: "1",
    description: "",
    baseURL: "https://deep.test",
    format: "openapi3",
    groups: [],
    schemas: { Deep: schema },
    securitySchemes: [],
    skipped: [],
  };
}

describe("specAsDeclared", () => {
  it("hands the transform a copy of a specification nested 1 000 objects deep", async () => {
    const seen: unknown[] = [];
    const entry: CourierImportEntry = {
      type: "openapi",
      importType: "file",
      outputDir: "src/api",
      transform: (spec) => {
        seen.push(spec);
        return spec;
      },
    };
    const spec = deep(1_000);

    const declared = await specAsDeclared("deep", entry, spec);

    expect(seen).toHaveLength(1);
    /* Compared without vitest's deep equality, which takes a stack frame per
       level and runs out of stack this deep: toEqual runs it, and so does
       toBe whenever the two values differ. */
    expect(Object.is(seen[0], spec)).toBe(false);
    expect(jsonText(declared)).toBe(jsonText(spec));
  });

  it("leaves the specification as parsed untouched by a transform that changes its copy", async () => {
    const spec = deep(3);
    const entry: CourierImportEntry = {
      type: "openapi",
      importType: "file",
      outputDir: "src/api",
      transform: (copy) => {
        if (typeof copy === "object" && copy !== null) Reflect.set(copy, "title", "Changed");
      },
    };

    const declared = await specAsDeclared("deep", entry, spec);

    expect(declared.title).toBe("Changed");
    expect(spec.title).toBe("Deep");
  });
});
