import { describe, expect, it } from "vitest"
import { generateCode } from "../src/apis/generator"
import type { GeneratedFile } from "../src/apis/generator/types"
import { DEFAULT_OPTIONS } from "../src/apis/generator/types"
import type { ParsedSpec } from "../src/apis/parser/types"

const SPEC: ParsedSpec = {
  title: "Pet Store",
  version: "1.0.0",
  description: "",
  baseURL: "https://api.petstore.com/v1",
  format: "openapi3",
  securitySchemes: [],
  skipped: [],
  groups: [
    {
      name: "pets",
      description: "",
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
          parameters: [
            { name: "limit", in: "query", required: false, type: "integer", description: "How many" },
          ],
          responseSchema: {
            name: "response",
            type: "array",
            items: { name: "item", type: "ref", refName: "Pet" },
          },
          tags: ["pets"],
        },
        {
          name: "create",
          operationId: "createPet",
          httpMethod: "post",
          path: "/",
          fullPath: "/pets",
          description: "",
          secured: true,
          requestBody: { name: "body", type: "ref", refName: "NewPet" },
          parameters: [],
          responseSchema: { name: "response", type: "ref", refName: "Pet" },
          tags: ["pets"],
        },
        {
          name: "getById",
          operationId: "getPet",
          httpMethod: "get",
          path: "/:petId",
          fullPath: "/pets/{petId}",
          description: "",
          secured: false,
          requestBody: null,
          parameters: [{ name: "petId", in: "path", required: true, type: "string", description: "" }],
          responseSchema: { name: "response", type: "ref", refName: "Pet" },
          tags: ["pets"],
        },
      ],
    },
  ],
  schemas: {
    Pet: {
      name: "Pet",
      type: "object",
      properties: {
        id: { type: "string", required: true },
        name: { type: "string", required: true, description: "Its name" },
      },
    },
    NewPet: {
      name: "NewPet",
      type: "object",
      properties: {
        name: { type: "string", required: true, description: "What to call it" },
      },
    },
  },
}

const COMBINATIONS = [
  { name: "default", options: {} },
  { name: "valibot", options: { validation: "valibot" as const } },
  { name: "arktype", options: { validation: "arktype" as const } },
  { name: "no validation", options: { validation: "none" as const } },
  { name: "no schemas", options: { generateSchemas: false } },
  { name: "no types", options: { generateTypes: false } },
  { name: "no comments", options: { includeComments: false } },
  { name: "flat source", options: { groupBy: "single" as const } },
  { name: "no auth middleware", options: { addAuthMiddleware: false } },
  { name: "schemas asked for, validation off", options: { validation: "none" as const, generateSchemas: true } },
  { name: "schemas without types", options: { generateSchemas: true, generateTypes: false } },
  { name: "neither schemas nor types", options: { validation: "none" as const, generateSchemas: false, generateTypes: false } },
  { name: "proxy client", options: { generateClient: "proxy" as const } },
]

/** Every name a file imports from a sibling module of the generated source. */
function imported(content: string): { from: string; names: string[] }[] {
  return [...content.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(\.\/[^"]+)"/g)].map((m) => ({
    from: m[2]!,
    names: m[1]!
      .split(",")
      .map((n) => n.trim().replace(/^type\s+/, ""))
      .filter(Boolean),
  }))
}

/** Every name a file exports, by declaration or by re-export. */
function exported(content: string): Set<string> {
  const names = new Set<string>()
  for (const m of content.matchAll(/export\s+(?:const|type|interface|function)\s+(\w+)/g)) {
    names.add(m[1]!)
  }
  return names
}

function find(files: GeneratedFile[], suffix: string): GeneratedFile | undefined {
  return files.find((f) => f.path.endsWith(suffix))
}

/**
 * Generated code has to compile in the project it lands in. These check the
 * two ways it stopped doing so: a name imported from a file that never
 * declares it, and a type named in a chain that nothing ever writes down.
 */
describe.each(COMBINATIONS)("generated with $name", ({ options }) => {
  const files = generateCode(SPEC, { ...DEFAULT_OPTIONS, ...options, outputDir: "src/api" })

  it("imports only names its siblings export", () => {
    const byPath = new Map(files.map((f) => [f.path, f.content]))

    for (const file of files) {
      for (const { from, names } of imported(file.content)) {
        const dir = file.path.slice(0, file.path.lastIndexOf("/"))
        const target = `${dir}/${from.slice(2)}.ts`
        const content = byPath.get(target)
        if (content === undefined) continue
        const available = exported(content)
        for (const name of names) {
          expect(available, `${file.path} imports ${name} from ${from}`).toContain(name)
        }
      }
    }
  })

  it("names no type that is never written down", () => {
    const group = find(files, "pets/index.ts") ?? find(files, "source.ts")
    expect(group).toBeDefined()

    const declared = new Set<string>()
    for (const file of files) {
      for (const name of exported(file.content)) declared.add(name)
    }
    for (const { names } of imported(group?.content ?? "")) {
      for (const name of names) declared.add(name)
    }

    for (const m of (group?.content ?? "").matchAll(/\.variables<([A-Za-z_$][\w$]*)>/g)) {
      expect(declared, `variables<${m[1]}> is not declared anywhere`).toContain(m[1]!)
    }
    for (const m of (group?.content ?? "").matchAll(/\.response<([A-Za-z_$][\w$]*)(?:\[\])?>/g)) {
      if (["unknown", "void", "null", "string", "number", "boolean"].includes(m[1]!)) continue
      expect(declared, `response<${m[1]}> is not declared anywhere`).toContain(m[1]!)
    }
  })

  it("leaves nothing it imported unused", () => {
    for (const file of files) {
      const body = file.content.replace(/^import[^\n]*\n/gm, "")
      for (const { names } of imported(file.content)) {
        for (const name of names) {
          expect(body, `${file.path} imports ${name} and never uses it`).toContain(name)
        }
      }
    }
  })
})
