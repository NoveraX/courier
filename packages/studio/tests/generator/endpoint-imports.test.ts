/**
 * What a generated endpoint file imports has to be exactly what it uses: a
 * validator it calls, every type its chains name, and nothing a sibling does
 * not declare — under every option, grouped or flat, and in a project that
 * compiles with `verbatimModuleSyntax`, as a Vite project does.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

const user = { $ref: "#/components/schemas/User" };
const customerOrDeleted = {
  oneOf: [
    { $ref: "#/components/schemas/Customer" },
    { $ref: "#/components/schemas/DeletedCustomer" },
  ],
};

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Shop", version: "1" },
    servers: [{ url: "https://shop.test/v1" }],
    paths: {
      "/users/createWithList": {
        post: {
          operationId: "createUsersWithListInput",
          tags: ["user"],
          requestBody: {
            content: { "application/json": { schema: { type: "array", items: user } } },
          },
          responses: {
            "200": { description: "ok", content: { "application/json": { schema: user } } },
          },
        },
      },
      "/customers/{id}": {
        delete: {
          operationId: "deleteCustomer",
          tags: ["user"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "ok",
              content: { "application/json": { schema: customerOrDeleted } },
            },
          },
        },
      },
      "/customers": {
        get: {
          operationId: "listCustomers",
          tags: ["user"],
          responses: {
            "200": {
              description: "ok",
              content: {
                "application/json": { schema: { type: "array", items: customerOrDeleted } },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        User: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string", description: "Shown on the profile" } },
        },
        Customer: { type: "object", properties: { id: { type: "string" } } },
        DeletedCustomer: {
          type: "object",
          properties: { id: { type: "string" }, deleted: { type: "boolean", enum: [true] } },
        },
      },
    },
  }),
);

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", { validation: "zod" }],
  ["valibot", { validation: "valibot" }],
  ["arktype", { validation: "arktype" }],
  ["none", { validation: "none" }],
  ["types-only", { generateSchemas: false }],
  ["no-types", { generateTypes: false }],
  ["none-no-types", { validation: "none", generateTypes: false }],
  ["neither", { generateSchemas: false, generateTypes: false }],
];

const CASES = (["tag", "single"] as const).flatMap((groupBy) =>
  VARIANTS.map(([label, options]) => ({ label: `${groupBy}-${label}`, groupBy, options })),
);

let problems = new Map<string, string[]>();

beforeAll(() => {
  const files = CASES.flatMap(({ label, groupBy, options }) =>
    generateCode(SPEC, { type: "openapi", outputDir: label, groupBy, ...options }, "shop"),
  );
  const dir = writeProject("endpoint-imports/all", files);
  const roots = CASES.map(({ label }) => `${label}/shop/index.ts`);
  const found = compileProject(dir, roots, { ...STRICT, verbatimModuleSyntax: true });
  problems = new Map(
    CASES.map(({ label }) => [label, found.filter((p) => p.startsWith(`${label}/`))]),
  );
}, 120_000);

afterAll(() => {
  removeProjects("endpoint-imports");
});

describe("the files an import generates", () => {
  it.each(CASES.map(({ label }) => label))(
    "compile, with verbatimModuleSyntax, for %s",
    (label) => {
      expect(problems.get(label)).toEqual([]);
    },
  );

  it("import the validator a list body is wrapped in", () => {
    const group = generateCode(SPEC, { type: "openapi", outputDir: "src" }, "shop").find((f) =>
      f.path.endsWith("user/index.ts"),
    );

    expect(group?.content).toContain("z.array(UserSchema)");
    expect(group?.content).toContain('import { z } from "zod";');
  });

  it("import types as types when no validator declares them", () => {
    const group = generateCode(
      SPEC,
      { type: "openapi", outputDir: "src", generateSchemas: false },
      "shop",
    ).find((f) => f.path.endsWith("user/index.ts"));
    const imports = group?.content.match(/^import \{([^}]*)\} from "\.\/types";$/m)?.[1] ?? "";
    const names = imports.split(",").map((name) => name.trim());

    expect(names).toContain("type User");
    expect(names.filter((name) => !name.startsWith("type "))).toEqual([]);
  });
});

describe("a flat import", () => {
  /* A response that is itself one of several shapes gets a type of its own;
     a list of them is typed where it is used, naming each alternative. */
  it("imports each type of a list response whose items are one of several", () => {
    const source = generateCode(
      SPEC,
      { type: "openapi", outputDir: "src", groupBy: "single" },
      "shop",
    ).find((f) => f.path.endsWith("shop/source.ts"));
    const imports = source?.content.match(/^import .* from "\.\/schemas";$/m)?.[0] ?? "";

    expect(imports).toContain("type Customer");
    expect(imports).toContain("type DeletedCustomer");
  });
});
