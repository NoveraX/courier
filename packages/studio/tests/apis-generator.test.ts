import { describe, expect, it } from "vitest";
import { generateCode } from "../src/apis/generator";
import { DEFAULT_OPTIONS as GENERATION_DEFAULTS } from "../src/apis/generator/types";
import type { ParsedSpec } from "../src/apis/parser/types";

const DEFAULT_OPTIONS = { ...GENERATION_DEFAULTS, outputDir: "src/api", sourceName: "api" };

const MOCK_SPEC: ParsedSpec = {
  title: "Pet Store",
  version: "1.0.0",
  description: "A pet store API",
  baseURL: "https://api.petstore.com/v1",
  format: "openapi3",
  groups: [
    {
      name: "pets",
      description: "Pet operations",
      prefix: "/pets",
      endpoints: [
        {
          name: "getAll",
          operationId: "listPets",
          httpMethod: "get",
          path: "/",
          fullPath: "/pets",
          description: "List all pets",
          secured: false,
          requestBody: null,
          parameters: [],
          responseSchema: {
            name: "response",
            type: "array",
            items: { name: "item", type: "ref", refName: "Pet" },
          },
          tags: ["pets"],
        },
        {
          name: "getById",
          operationId: "getPetById",
          httpMethod: "get",
          path: "/:petId",
          fullPath: "/pets/{petId}",
          description: "Get a pet by ID",
          secured: false,
          requestBody: null,
          parameters: [
            { name: "petId", in: "path", required: true, type: "string", description: "Pet ID" },
          ],
          responseSchema: { name: "response", type: "ref", refName: "Pet" },
          tags: ["pets"],
        },
        {
          name: "create",
          operationId: "createPet",
          httpMethod: "post",
          path: "/",
          fullPath: "/pets",
          description: "Create a new pet",
          secured: true,
          requestBody: { name: "body", type: "ref", refName: "NewPet" },
          parameters: [],
          responseSchema: { name: "response", type: "ref", refName: "Pet" },
          tags: ["pets"],
        },
      ],
    },
    {
      name: "users",
      description: "User management",
      prefix: "/users",
      endpoints: [
        {
          name: "getAll",
          operationId: "listUsers",
          httpMethod: "get",
          path: "/",
          fullPath: "/users",
          description: "List all users",
          secured: true,
          requestBody: null,
          parameters: [],
          responseSchema: null,
          tags: ["users"],
        },
      ],
    },
  ],
  schemas: {
    Pet: {
      name: "Pet",
      type: "object",
      required: ["id", "name"],
      properties: {
        id: { type: "integer", required: true },
        name: { type: "string", required: true },
        tag: { type: "string", required: false },
      },
    },
    NewPet: {
      name: "NewPet",
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", required: true },
        tag: { type: "string", required: false },
      },
    },
  },
  securitySchemes: [{ name: "bearerAuth", type: "bearer" }],
  skipped: [],
};

describe("generateCode", () => {
  it("generates files for each group + source + index", () => {
    const files = generateCode(MOCK_SPEC, DEFAULT_OPTIONS);

    const paths = files.map((f) => f.path);
    expect(paths.some((p) => p.includes("pets/index.ts"))).toBe(true);
    expect(paths.some((p) => p.includes("users/index.ts"))).toBe(true);
    expect(paths.some((p) => p.includes("source.ts"))).toBe(true);
    expect(
      paths.some((p) => p.includes("index.ts") && !p.includes("pets") && !p.includes("users")),
    ).toBe(true);
  });

  it("generates schema files when generateSchemas is true", () => {
    const files = generateCode(MOCK_SPEC, { ...DEFAULT_OPTIONS, generateSchemas: true });

    const schemaFile = files.find((f) => f.path.includes("pets/schemas.ts"));
    expect(schemaFile).toBeDefined();
    expect(schemaFile?.content).toContain("z.looseObject");
  });

  it("generates type-only files when generateSchemas is false and generateTypes is true", () => {
    const files = generateCode(MOCK_SPEC, {
      ...DEFAULT_OPTIONS,
      generateSchemas: false,
      generateTypes: true,
    });

    const typesFile = files.find((f) => f.path.includes("pets/types.ts"));
    expect(typesFile).toBeDefined();
    expect(typesFile?.content).toContain("type");
    expect(typesFile?.content).not.toContain("z.object");
  });

  it("uses Valibot when validation is valibot", () => {
    const files = generateCode(MOCK_SPEC, { ...DEFAULT_OPTIONS, validation: "valibot" });

    const schemaFile = files.find((f) => f.path.includes("pets/schemas.ts"));
    expect(schemaFile).toBeDefined();
    expect(schemaFile?.content).toContain("v.looseObject");
  });

  it("uses ArkType when validation is arktype", () => {
    const files = generateCode(MOCK_SPEC, { ...DEFAULT_OPTIONS, validation: "arktype" });

    const schemaFile = files.find((f) => f.path.includes("pets/schemas.ts"));
    expect(schemaFile).toBeDefined();
    expect(schemaFile?.content).toContain("type(");
  });

  it("generates defineGroup with endpoints", () => {
    const files = generateCode(MOCK_SPEC, DEFAULT_OPTIONS);

    const petsFile = files.find((f) => f.path.includes("pets/index.ts"));
    expect(petsFile).toBeDefined();
    expect(petsFile?.content).toContain("defineGroup");
    expect(petsFile?.content).toContain("getAll");
    expect(petsFile?.content).toContain("getById");
    expect(petsFile?.content).toContain("create");
  });

  it("generates defineApi in source file", () => {
    const files = generateCode(MOCK_SPEC, DEFAULT_OPTIONS);

    const sourceFile = files.find((f) => f.path.includes("source.ts"));
    expect(sourceFile).toBeDefined();
    expect(sourceFile?.content).toContain("defineApi");
    expect(sourceFile?.content).toContain("https://api.petstore.com/v1");
    expect(sourceFile?.content).toContain("pets");
    expect(sourceFile?.content).toContain("users");
  });

  it("opens each endpoint with the verb the spec names", () => {
    const files = generateCode(MOCK_SPEC, DEFAULT_OPTIONS);
    const petsFile = files.find((f) => f.path.includes("pets/index.ts"));

    expect(petsFile?.content).toContain("const { endpoint } = courier();");
    expect(petsFile?.content).toContain('getAll: endpoint.get("")');
    expect(petsFile?.content).toContain('create: endpoint.post("")');
    expect(petsFile?.content).toContain('getById: endpoint.get(":petId")');
  });

  it("declares the base a flat source addresses", () => {
    const files = generateCode(MOCK_SPEC, { ...DEFAULT_OPTIONS, groupBy: "single" });
    const sourceFile = files.find((f) => f.path.includes("source.ts"));

    expect(sourceFile?.content).toContain("const { endpoint } = courier();");
    for (const opened of openings(sourceFile?.content ?? "")) {
      expect(opened).toMatch(/^endpoint\.(get|head|post|put|patch|del)\(/);
    }
  });

  it("declares a response's type beside the loose schema that validates it", () => {
    const files = generateCode(MOCK_SPEC, DEFAULT_OPTIONS);

    const petsFile = files.find((f) => f.path.includes("pets/index.ts"));
    expect(petsFile?.content).toContain(".response<Pet[]>(z.array(PetSchema))");
    expect(petsFile?.content).toMatch(/import \{[^}]*type Pet\b[^}]*\} from "\.\/schemas"/);
  });

  it("names no type beside a schema when no types are generated", () => {
    const files = generateCode(MOCK_SPEC, { ...DEFAULT_OPTIONS, generateTypes: false });

    const petsFile = files.find((f) => f.path.includes("pets/index.ts"));
    expect(petsFile?.content).toContain(".response(z.array(PetSchema))");
    expect(petsFile?.content).not.toContain("type Pet");
  });

  it("imports the response type when no schema is generated", () => {
    const files = generateCode(MOCK_SPEC, {
      ...DEFAULT_OPTIONS,
      generateSchemas: false,
      validation: "none",
    });

    const petsFile = files.find((f) => f.path.includes("pets/index.ts"));
    expect(petsFile?.content).toContain(".response<Pet[]>()");
    expect(petsFile?.content).toContain("Pet");
  });

  it("generates barrel index with re-exports", () => {
    const files = generateCode(MOCK_SPEC, DEFAULT_OPTIONS);

    const indexFile = files.find(
      (f) => f.path.endsWith("index.ts") && !f.path.includes("pets") && !f.path.includes("users"),
    );
    expect(indexFile).toBeDefined();
    expect(indexFile?.content).toContain("createCaller");
  });

  it("filters endpoints by selectedEndpoints", () => {
    const files = generateCode(MOCK_SPEC, {
      ...DEFAULT_OPTIONS,
      selectedEndpoints: { pets: ["getAll", "create"] },
    });

    const petsFile = files.find((f) => f.path.includes("pets/index.ts"));
    expect(petsFile).toBeDefined();
    expect(petsFile?.content).toContain("getAll");
    expect(petsFile?.content).toContain("create");
    expect(petsFile?.content).not.toContain("getById");

    // users group is not in selectedEndpoints, so it should be excluded
    const usersFile = files.find((f) => f.path.includes("users/index.ts"));
    expect(usersFile).toBeUndefined();
  });

  it("includes JSDoc comments when includeComments is true", () => {
    const files = generateCode(MOCK_SPEC, { ...DEFAULT_OPTIONS, includeComments: true });

    const petsFile = files.find((f) => f.path.includes("pets/index.ts"));
    expect(petsFile?.content).toContain("List all pets");
  });

  it("excludes JSDoc comments when includeComments is false", () => {
    const files = generateCode(MOCK_SPEC, { ...DEFAULT_OPTIONS, includeComments: false });

    const petsFile = files.find((f) => f.path.includes("pets/index.ts"));
    expect(petsFile?.content).not.toContain("List all pets");
  });

  it("generates no schema files when validation is none and generateTypes is false", () => {
    const files = generateCode(MOCK_SPEC, {
      ...DEFAULT_OPTIONS,
      validation: "none",
      generateSchemas: false,
      generateTypes: false,
    });

    const schemaFiles = files.filter((f) => f.path.includes("schemas.ts"));
    expect(schemaFiles).toHaveLength(0);
  });

  it("all generated files have non-empty content", () => {
    const files = generateCode(MOCK_SPEC, DEFAULT_OPTIONS);

    for (const file of files) {
      expect(file.content.length).toBeGreaterThan(0);
      expect(file.path.length).toBeGreaterThan(0);
    }
  });
});

/** How each generated endpoint opens, e.g. `endpoint.get("")`. */
function openings(content: string): string[] {
  return [...content.matchAll(/^\s+\w+: (endpoint\.\w+\()/gm)].map((m) => m[1]!);
}
