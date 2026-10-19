/**
 * A reference to a component the specification does not declare is
 * generated as an unknown value: referred to by name, it made code naming a
 * type nothing declared, which no project compiled.
 */
import { afterAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

const owner = { $ref: "#/components/schemas/Owner" };

const SPEC = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Shop", version: "1" },
  servers: [{ url: "https://shop.test" }],
  paths: {
    "/pets": {
      post: {
        operationId: "addPet",
        tags: ["pets"],
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
        },
        responses: {
          200: { description: "ok", content: { "application/json": { schema: owner } } },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: "object",
        properties: { owner, sitters: { type: "array", items: owner } },
      },
    },
  },
});

const VALIDATORS: Array<[string, Partial<GenerateOptions>]> = [
  ["zod", {}],
  ["valibot", { validation: "valibot" }],
  ["arktype", { validation: "arktype" }],
  ["none", { validation: "none" }],
];

afterAll(() => removeProjects("unresolved-refs"));

describe.each(VALIDATORS)(
  "a reference to an undeclared component, validated with %s",
  (label, options) => {
    it("compiles", () => {
      const files = generateCode(
        parseSpec(SPEC),
        { type: "openapi", outputDir: "src/api", ...options },
        "shop",
      );
      const dir = writeProject(`unresolved-refs/${label}`, files);

      expect(
        compileProject(dir, ["src/api/shop/index.ts"], {
          ...STRICT,
          exactOptionalPropertyTypes: true,
        }),
      ).toEqual([]);
    });
  },
);
