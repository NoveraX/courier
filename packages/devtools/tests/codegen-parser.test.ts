import { describe, expect, it } from "vitest"
import { detectFormat, parseSpec } from "../src/codegen/parser"

const OPENAPI3_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Pet Store", version: "1.0.0", description: "A pet store API" },
  servers: [{ url: "https://api.petstore.com/v1" }],
  tags: [
    { name: "pets", description: "Pet operations" },
    { name: "users", description: "User management" },
  ],
  paths: {
    "/pets": {
      get: {
        tags: ["pets"],
        operationId: "listPets",
        summary: "List all pets",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Pet" } },
              },
            },
          },
        },
      },
      post: {
        tags: ["pets"],
        operationId: "createPet",
        summary: "Create a pet",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NewPet" },
            },
          },
        },
        responses: {
          "201": {
            content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
          },
        },
      },
    },
    "/pets/{petId}": {
      get: {
        tags: ["pets"],
        operationId: "getPetById",
        parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
          },
        },
      },
      delete: {
        tags: ["pets"],
        operationId: "deletePet",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": {} },
      },
    },
    "/users": {
      get: {
        tags: ["users"],
        operationId: "listUsers",
        responses: {
          "200": {
            content: { "application/json": { schema: { type: "array", items: { type: "object" } } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: "object",
        required: ["id", "name"],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          tag: { type: "string" },
        },
      },
      NewPet: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          tag: { type: "string" },
        },
      },
    },
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
  },
  security: [],
})

const SWAGGER2_SPEC = JSON.stringify({
  swagger: "2.0",
  info: { title: "Legacy API", version: "2.0.0" },
  basePath: "/api/v2",
  paths: {
    "/items": {
      get: {
        tags: ["items"],
        operationId: "getItems",
        produces: ["application/json"],
        responses: {
          "200": {
            schema: { type: "array", items: { $ref: "#/definitions/Item" } },
          },
        },
      },
    },
  },
  definitions: {
    Item: {
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string" },
      },
    },
  },
})

const POSTMAN_SPEC = JSON.stringify({
  info: { name: "My API", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  item: [
    {
      name: "Users",
      item: [
        {
          name: "Get Users",
          request: {
            method: "GET",
            url: { raw: "https://api.example.com/users", host: ["api", "example", "com"], path: ["users"] },
          },
        },
        {
          name: "Create User",
          request: {
            method: "POST",
            url: { raw: "https://api.example.com/users", host: ["api", "example", "com"], path: ["users"] },
            body: { mode: "raw", raw: '{"name":"Alice","email":"a@b.com"}' },
          },
        },
      ],
    },
  ],
})

describe("detectFormat", () => {
  it("detects OpenAPI 3.x JSON", () => {
    expect(detectFormat(OPENAPI3_SPEC)).toBe("openapi3-json")
  })

  it("detects Swagger 2.0 JSON", () => {
    expect(detectFormat(SWAGGER2_SPEC)).toBe("swagger2-json")
  })

  it("detects Postman collection", () => {
    expect(detectFormat(POSTMAN_SPEC)).toBe("postman")
  })

  it("detects OpenAPI 3.x YAML", () => {
    expect(detectFormat("openapi: '3.0.0'\ninfo:\n  title: Test")).toBe("openapi3-yaml")
  })

  it("detects Swagger 2.0 YAML", () => {
    expect(detectFormat("swagger: '2.0'\ninfo:\n  title: Test")).toBe("swagger2-yaml")
  })

  it("returns unknown for invalid input", () => {
    expect(detectFormat("not a spec")).toBe("unknown")
    expect(detectFormat("{}")).toBe("unknown")
  })
})

describe("parseSpec — OpenAPI 3.x", () => {
  it("parses metadata correctly", () => {
    const spec = parseSpec(OPENAPI3_SPEC)

    expect(spec.title).toBe("Pet Store")
    expect(spec.version).toBe("1.0.0")
    expect(spec.description).toBe("A pet store API")
    expect(spec.baseURL).toBe("https://api.petstore.com/v1")
    expect(spec.format).toBe("openapi3")
  })

  it("extracts groups from tags", () => {
    const spec = parseSpec(OPENAPI3_SPEC)

    expect(spec.groups).toHaveLength(2)
    expect(spec.groups[0]!.name).toBe("pets")
    expect(spec.groups[1]!.name).toBe("users")
  })

  it("extracts group descriptions from tags", () => {
    const spec = parseSpec(OPENAPI3_SPEC)

    expect(spec.groups[0]!.description).toBe("Pet operations")
    expect(spec.groups[1]!.description).toBe("User management")
  })

  it("extracts endpoints with correct HTTP methods", () => {
    const spec = parseSpec(OPENAPI3_SPEC)
    const pets = spec.groups[0]!

    expect(pets.endpoints).toHaveLength(4)
    expect(pets.endpoints.map((e) => e.httpMethod)).toEqual(["get", "post", "get", "delete"])
  })

  it("extracts endpoint names from operationId", () => {
    const spec = parseSpec(OPENAPI3_SPEC)
    const pets = spec.groups[0]!

    expect(pets.endpoints[0]!.name).toBe("listPets")
    expect(pets.endpoints[1]!.name).toBe("createPet")
    expect(pets.endpoints[2]!.name).toBe("getPetById")
    expect(pets.endpoints[3]!.name).toBe("deletePet")
  })

  it("extracts path parameters", () => {
    const spec = parseSpec(OPENAPI3_SPEC)
    const getPetById = spec.groups[0]!.endpoints[2]!

    expect(getPetById.parameters).toHaveLength(1)
    expect(getPetById.parameters[0]).toMatchObject({
      name: "petId",
      in: "path",
      required: true,
      type: "string",
    })
  })

  it("marks secured endpoints", () => {
    const spec = parseSpec(OPENAPI3_SPEC)
    const pets = spec.groups[0]!

    expect(pets.endpoints[0]!.secured).toBe(false)
    expect(pets.endpoints[1]!.secured).toBe(true)
    expect(pets.endpoints[3]!.secured).toBe(true)
  })

  it("extracts request body schema", () => {
    const spec = parseSpec(OPENAPI3_SPEC)
    const createPet = spec.groups[0]!.endpoints[1]!

    expect(createPet.requestBody).not.toBeNull()
    expect(createPet.requestBody?.type).toBe("ref")
    expect(createPet.requestBody?.refName).toBe("NewPet")
  })

  it("extracts response schema", () => {
    const spec = parseSpec(OPENAPI3_SPEC)
    const listPets = spec.groups[0]!.endpoints[0]!

    expect(listPets.responseSchema).not.toBeNull()
    expect(listPets.responseSchema?.type).toBe("array")
  })

  it("extracts component schemas", () => {
    const spec = parseSpec(OPENAPI3_SPEC)
    const pet = spec.schemas.Pet!

    expect(Object.keys(spec.schemas)).toEqual(["Pet", "NewPet"])
    expect(pet.type).toBe("object")
    expect(pet.properties?.id!.type).toBe("integer")
    expect(pet.required).toContain("id")
    expect(pet.required).toContain("name")
  })

  it("extracts security schemes", () => {
    const spec = parseSpec(OPENAPI3_SPEC)

    expect(spec.securitySchemes).toHaveLength(1)
    expect(spec.securitySchemes[0]).toMatchObject({
      name: "bearerAuth",
      type: "bearer",
    })
  })

  it("computes common prefix for groups", () => {
    const spec = parseSpec(OPENAPI3_SPEC)

    expect(spec.groups[0]!.prefix).toBe("/pets")
    // Single-endpoint groups get "/" since findCommonPrefix needs 2+ paths
    expect(spec.groups[1]!.prefix).toBe("/")
  })
})

describe("parseSpec — Swagger 2.0", () => {
  it("converts to OpenAPI 3 format", () => {
    const spec = parseSpec(SWAGGER2_SPEC)

    expect(spec.format).toBe("swagger2")
    expect(spec.title).toBe("Legacy API")
    expect(spec.baseURL).toBe("/api/v2")
  })

  it("extracts endpoints from Swagger 2.0", () => {
    const spec = parseSpec(SWAGGER2_SPEC)

    expect(spec.groups.length).toBeGreaterThanOrEqual(1)
    const items = spec.groups.find((g) => g.name === "items")
    expect(items).toBeDefined()
    expect(items!.endpoints[0]!.name).toBe("getItems")
    expect(items!.endpoints[0]!.httpMethod).toBe("get")
  })

  it("converts definitions to schemas", () => {
    const spec = parseSpec(SWAGGER2_SPEC)
    const item = spec.schemas.Item!

    expect(item).toBeDefined()
    expect(item.type).toBe("object")
  })
})

describe("parseSpec — Postman", () => {
  it("parses Postman collection", () => {
    const spec = parseSpec(POSTMAN_SPEC)

    expect(spec.format).toBe("postman")
    expect(spec.title).toBe("My API")
  })

  it("extracts groups from folders", () => {
    const spec = parseSpec(POSTMAN_SPEC)

    expect(spec.groups.length).toBeGreaterThanOrEqual(1)
    const users = spec.groups.find((g) => g.name === "users")
    expect(users).toBeDefined()
  })

  it("extracts endpoints from items", () => {
    const spec = parseSpec(POSTMAN_SPEC)
    const users = spec.groups.find((g) => g.name === "users")!

    expect(users.endpoints.length).toBe(2)
    expect(users.endpoints[0]!.httpMethod).toBe("get")
    expect(users.endpoints[1]!.httpMethod).toBe("post")
  })
})

describe("parseSpec — errors", () => {
  it("throws on unknown format", () => {
    expect(() => parseSpec("random text")).toThrow("Unable to detect spec format")
  })

  it("throws on empty JSON", () => {
    expect(() => parseSpec("{}")).toThrow("Unable to detect spec format")
  })
})
