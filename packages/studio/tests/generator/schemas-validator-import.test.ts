/**
 * A schemas module imports its validation library only when its code calls
 * it. A group's module whose every declaration names a schema of the
 * import's own — `export const TagSchema = CategorySchema;` — imported the
 * library all the same, and a project compiling with `noUnusedLocals`
 * refused it; a mention in a comment calls nothing.
 */
import { afterAll, describe, expect, it } from "vitest";

import { type GenerateOptions, generateCode } from "../../src/apis/generator";
import { schemasValidatorImport } from "../../src/apis/generator/schemas-validator-import";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

const json = (name: string) => ({
  "application/json": { schema: { $ref: `#/components/schemas/${name}` } },
});

/* `Tag` only names `Category`, which both groups use, so the group of tags declares an alias alone. */
const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Shop", version: "1" },
    components: {
      schemas: {
        Category: { type: "object", properties: { name: { type: "string" } } },
        Tag: { $ref: "#/components/schemas/Category" },
      },
    },
    paths: {
      "/categories": {
        get: {
          operationId: "listCategories",
          tags: ["categories"],
          responses: { "200": { description: "ok", content: json("Category") } },
        },
      },
      "/tags": {
        get: {
          operationId: "listTags",
          tags: ["tags"],
          responses: { "200": { description: "ok", content: json("Tag") } },
        },
        post: {
          operationId: "addTag",
          tags: ["tags"],
          responses: { "200": { description: "ok", content: json("Category") } },
        },
      },
    },
  }),
);

afterAll(() => removeProjects("schemas-validator-import"));

describe("schemasValidatorImport", () => {
  it("imports the library a line of code calls, and not one a comment mentions", () => {
    expect(schemasValidatorImport("zod", ["export const A = z.string();"])).toEqual([
      'import { z } from "zod";',
    ]);
    expect(schemasValidatorImport("valibot", ["/**", " * Read with v.parse.", " */"])).toEqual([]);
    expect(schemasValidatorImport("arktype", ["export type Tag = Category;"])).toEqual([]);
    expect(schemasValidatorImport("arktype", ['export const A = type("string");'])).toEqual([
      'import { type } from "arktype";',
    ]);
    expect(schemasValidatorImport("none", ["export const A = z.string();"])).toEqual([]);
  });
});

describe.each([["zod"], ["valibot"], ["arktype"]] as const)(
  "a group's module of aliases, with %s",
  (validation) => {
    const options: Partial<GenerateOptions> = { validation, generateTypes: true, groupBy: "tag" };
    const files = generateCode(SPEC, { type: "openapi", outputDir: "src/api", ...options }, "shop");

    it("imports no validation library, and compiles with every check on", () => {
      const tags = files.find((file) => file.path === "src/api/shop/tags/schemas.ts");

      expect(tags?.content).toContain("export const TagSchema = CategorySchema;");
      expect(tags?.content).not.toMatch(/from "(zod|valibot|arktype)"/);
      const dir = writeProject(`schemas-validator-import/${validation}`, files);
      expect(
        compileProject(dir, ["src/api/shop/index.ts"], { ...STRICT, noUnusedLocals: true }),
      ).toEqual([]);
    }, 60_000);
  },
);
