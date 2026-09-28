/**
 * With neither a validator nor types, nothing is declared, so no schemas
 * file is written — not even one holding the schemas' descriptions alone,
 * which the barrel then re-exported as a module that is not one.
 */
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, writeProject } from "../helpers/generated-project";

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Pets", version: "1" },
    servers: [{ url: "https://pets.test" }],
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          tags: ["pets"],
          responses: {
            "200": {
              description: "ok",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Pet: {
          type: "object",
          description: "A pet in the store.",
          properties: { kind: { $ref: "#/components/schemas/Kind" } },
        },
        Kind: { type: "string", enum: ["cat", "dog"], description: "What the pet is." },
      },
    },
  }),
);

afterAll(() => {
  removeProjects("generate-code");
});

describe.each(["tag", "single"] as const)("with no validator and no types, grouped by %s", (groupBy) => {
  const files = generateCode(
    SPEC,
    { type: "openapi", outputDir: "src", validation: "none", generateTypes: false, groupBy },
    "pets",
  );

  it("writes no schemas file", () => {
    expect(files.map((file) => file.path).filter((path) => path.endsWith("schemas.ts"))).toEqual([]);
  });

  it("compiles", () => {
    const dir = writeProject(`generate-code/${groupBy}`, files);

    expect(compileProject(dir, ["src/pets/index.ts"])).toEqual([]);
  }, 60_000);
});
