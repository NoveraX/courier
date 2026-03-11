import { describe, expect, it } from "vitest"
import type { GeneratedFile } from "../src/codegen/generator/types"
import { computeHash } from "../src/codegen/merge/hash"
import type { EndpointFingerprint, RegistrySource } from "../src/codegen/merge/types"
import { previewUpdate } from "../src/codegen/merge/update-flow"
import type { ParsedSpec } from "../src/codegen/parser/types"

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSpec(overrides: Partial<ParsedSpec> = {}): ParsedSpec {
  return {
    title: "Test API",
    version: "1.0.0",
    description: "",
    baseURL: "/api",
    format: "openapi3",
    groups: [],
    schemas: {},
    securitySchemes: [],
    ...overrides,
  }
}

const GROUP_CONTENT = `import { defineGroup, endpoint } from "@noverax/nexus/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>()((http) => http.get("")),
    getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars)),
  },
});
`

const INDEX_CONTENT = `export { users } from "./users";
`

function makeFingerprints(content: string): Record<string, EndpointFingerprint> {
  const result: Record<string, EndpointFingerprint> = {}
  const re = /^\s{4}(\w+):\s*endpoint/gm
  let match: RegExpExecArray | null = re.exec(content)
  while (match) {
    const name = match[1]!
    /* Use a simplified code block for hash — matches extractEndpoints logic */
    result[name] = { hash: computeHash(getEndpointLine(content, name)), userModified: false }
    match = re.exec(content)
  }
  return result
}

function getEndpointLine(content: string, name: string): string {
  const lines = content.split("\n")
  for (const line of lines) {
    if (line.match(new RegExp(`^\\s+${name}:\\s*endpoint`))) return line
  }
  return ""
}

function makeSource(overrides: Partial<RegistrySource> = {}): RegistrySource {
  return {
    specSource: { type: "url", value: "https://example.com/spec.json" },
    specHash: "abc123",
    specVersion: "1.0.0",
    lastSynced: "2026-01-01T00:00:00.000Z",
    outputDir: "src/api",
    options: {
      sourceName: "test",
      outputDir: "src/api",
      validation: "zod",
      groupBy: "tag",
      naming: "camelCase",
      generateTypes: true,
      generateSchemas: true,
      addAuthMiddleware: true,
      includeComments: true,
      generateClient: "direct",
      selectedEndpoints: null,
    },
    endpoints: makeFingerprints(GROUP_CONTENT),
    cachedSpec: makeSpec(),
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("previewUpdate", () => {
  it("returns safe status when no existing files", () => {
    const source = makeSource()
    const generated: GeneratedFile[] = [
      { path: "src/api/test/users.ts", content: GROUP_CONTENT },
      { path: "src/api/test/index.ts", content: INDEX_CONTENT },
    ]

    const result = previewUpdate(source, makeSpec(), generated, {})

    expect(result.files).toHaveLength(2)
    expect(result.files[0]!.status).toBe("safe")
    expect(result.files[1]!.status).toBe("safe")
    expect(result.files[0]!.content).toBe(GROUP_CONTENT)
  })

  it("returns safe status for unchanged group files", () => {
    const source = makeSource()
    const generated: GeneratedFile[] = [
      { path: "src/api/test/users.ts", content: GROUP_CONTENT },
    ]
    const existing = { "src/api/test/users.ts": GROUP_CONTENT }

    const result = previewUpdate(source, makeSpec(), generated, existing)

    expect(result.files[0]!.status).toBe("safe")
    expect(result.files[0]!.content).toContain("getAll")
    expect(result.files[0]!.content).toContain("getById")
  })

  it("preserves user modifications in group files", () => {
    const userModified = GROUP_CONTENT.replace(
      'http.get("")',
      'http.get("", { headers: { "X-Custom": "true" } })',
    )
    const source = makeSource()
    const newGenerated = GROUP_CONTENT.replace(
      "getAll: endpoint<User[]>()((",
      "getAll: endpoint<User[]>({ response: z.array(UserSchema) })((",
    )
    const generated: GeneratedFile[] = [
      { path: "src/api/test/users.ts", content: newGenerated },
    ]
    const existing = { "src/api/test/users.ts": userModified }

    const result = previewUpdate(source, makeSpec(), generated, existing)

    expect(result.files[0]!.status).toBe("merged")
    expect(result.files[0]!.content).toContain("X-Custom")
  })

  it("adds new endpoints from updated spec", () => {
    const source = makeSource()
    const newGenerated = GROUP_CONTENT.replace(
      "  },\n});",
      '    create: endpoint<User, CreateVars>()((http, vars) => http.post("", vars)),\n  },\n});',
    )
    const generated: GeneratedFile[] = [
      { path: "src/api/test/users.ts", content: newGenerated },
    ]
    const existing = { "src/api/test/users.ts": GROUP_CONTENT }

    const result = previewUpdate(source, makeSpec(), generated, existing)

    expect(result.files[0]!.content).toContain("create:")
    expect(result.files[0]!.content).toContain("http.post")
  })

  it("overwrites non-group files without merge", () => {
    const source = makeSource()
    const newIndex = `export { users } from "./users";\nexport { posts } from "./posts";\n`
    const generated: GeneratedFile[] = [
      { path: "src/api/test/index.ts", content: newIndex },
    ]
    const existing = { "src/api/test/index.ts": INDEX_CONTENT }

    const result = previewUpdate(source, makeSpec(), generated, existing)

    expect(result.files[0]!.status).toBe("safe")
    expect(result.files[0]!.content).toBe(newIndex)
  })

  it("detects breaking changes from spec diff", () => {
    const oldSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{
          name: "getAll",
          operationId: null,
          httpMethod: "get",
          path: "/",
          fullPath: "/users",
          description: "",
          secured: false,
          requestBody: null,
          parameters: [],
          responseSchema: null,
          tags: [],
        }],
      }],
    })
    const newSpec = makeSpec({
      version: "2.0.0",
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [],
      }],
    })
    const source = makeSource({ cachedSpec: oldSpec })
    const generated: GeneratedFile[] = [
      { path: "src/api/test/users.ts", content: GROUP_CONTENT },
    ]

    const result = previewUpdate(source, newSpec, generated, {})

    expect(result.breakingChanges.length).toBeGreaterThan(0)
    expect(result.breakingChanges.some((b) => b.severity === "breaking")).toBe(true)
  })

  it("updates registry source with new spec info", () => {
    const source = makeSource()
    const newSpec = makeSpec({ version: "2.0.0" })
    const generated: GeneratedFile[] = [
      { path: "src/api/test/users.ts", content: GROUP_CONTENT },
    ]

    const result = previewUpdate(source, newSpec, generated, {})

    expect(result.registryUpdate.specVersion).toBe("2.0.0")
    expect(result.registryUpdate.cachedSpec).toEqual(newSpec)
    expect(result.registryUpdate.lastSynced).not.toBe(source.lastSynced)
  })

  it("computes new fingerprints from generated code", () => {
    const source = makeSource()
    const generated: GeneratedFile[] = [
      { path: "src/api/test/users.ts", content: GROUP_CONTENT },
      { path: "src/api/test/index.ts", content: INDEX_CONTENT },
    ]

    const result = previewUpdate(source, makeSpec(), generated, {})

    expect(Object.keys(result.registryUpdate.endpoints)).toContain("getAll")
    expect(Object.keys(result.registryUpdate.endpoints)).toContain("getById")
    expect(result.registryUpdate.endpoints.getAll?.hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it("preserves user-added endpoints not in new spec", () => {
    const existingWithCustom = GROUP_CONTENT.replace(
      "  },\n});",
      '    myCustom: endpoint<void>()((http) => http.post("custom")),\n  },\n});',
    )
    const source = makeSource()
    /* Generated has only getAll, getById — no myCustom */
    const generated: GeneratedFile[] = [
      { path: "src/api/test/users.ts", content: GROUP_CONTENT },
    ]
    const existing = { "src/api/test/users.ts": existingWithCustom }

    const result = previewUpdate(source, makeSpec(), generated, existing)

    expect(result.files[0]!.content).toContain("myCustom")
    expect(result.files[0]!.content).toContain('http.post("custom")')
  })

  it("handles multiple files with mixed statuses", () => {
    const source = makeSource()
    const postsGroup = GROUP_CONTENT.replace(/users/g, "posts").replace(/User/g, "Post")
    const generated: GeneratedFile[] = [
      { path: "src/api/test/users.ts", content: GROUP_CONTENT },
      { path: "src/api/test/posts.ts", content: postsGroup },
      { path: "src/api/test/index.ts", content: INDEX_CONTENT },
    ]
    const existing = {
      "src/api/test/users.ts": GROUP_CONTENT,
      /* posts.ts is new — no existing file */
    }

    const result = previewUpdate(source, makeSpec(), generated, existing)

    expect(result.files).toHaveLength(3)
    /* users.ts — existing, unchanged → safe merge */
    expect(result.files[0]!.path).toBe("src/api/test/users.ts")
    /* posts.ts — no existing → safe overwrite */
    expect(result.files[1]!.status).toBe("safe")
    /* index.ts — non-group → safe overwrite */
    expect(result.files[2]!.status).toBe("safe")
  })
})
