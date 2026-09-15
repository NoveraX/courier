import { describe, expect, it } from "vitest"
import { extractEndpoints } from "../src/apis/merge/extract-endpoints"
import { classifyEndpoints, generateFingerprints } from "../src/apis/merge/fingerprint"
import { computeHash, normalizeCode } from "../src/apis/merge/hash"
import { diffSpecs } from "../src/apis/merge/spec-diff"

// ── Fingerprint: normalizeCode ──────────────────────────────────────────────

describe("normalizeCode", () => {
  it("collapses whitespace and trims", () => {
    const code = `  foo(  bar  ,  baz  )  `
    expect(normalizeCode(code)).toBe("foo(bar,baz)")
  })

  it("strips single-line comments", () => {
    const code = `foo() // this is a comment\nbar()`
    expect(normalizeCode(code)).toBe("foo()bar()")
  })

  it("strips block comments", () => {
    const code = `foo(/* comment */) + bar()`
    expect(normalizeCode(code)).toBe("foo()+bar()")
  })

  it("removes trailing commas", () => {
    const code = `{ a, b, c, }`
    expect(normalizeCode(code)).toBe("{a,b,c}")
  })

  it("produces same result for differently formatted code", () => {
    const compact = `endpoint<User[]>({response:z.array(UserSchema)})((http)=>http.get(""))`
    const expanded = `endpoint<User[]>({
      response: z.array(UserSchema),
    })(
      (http) => http.get(""),
    )`
    expect(normalizeCode(compact)).toBe(normalizeCode(expanded))
  })
})

// ── Fingerprint: computeHash ────────────────────────────────────────────────

describe("computeHash", () => {
  it("returns a 16-char hex string", () => {
    const hash = computeHash("some code")
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it("returns same hash for equivalent code with different formatting", () => {
    const a = computeHash(`foo( bar,  baz )`)
    const b = computeHash(`foo(bar, baz)`)
    expect(a).toBe(b)
  })

  it("returns different hash for different code", () => {
    const a = computeHash("foo()")
    const b = computeHash("bar()")
    expect(a).not.toBe(b)
  })
})

// ── Fingerprint: extractEndpoints ───────────────────────────────────────────

describe("extractEndpoints", () => {
  it("extracts single-line endpoints", () => {
    const file = `export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>()(http => http.get("")),
  },
})`
    const result = extractEndpoints(file)
    expect(Object.keys(result)).toEqual(["getAll"])
    expect(result.getAll).toContain("endpoint<User[]>")
  })

  it("extracts multi-line endpoints", () => {
    const file = `export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>({
      response: z.array(UserSchema),
    })((http) => http.get("")),
    getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars)),
  },
})`
    const result = extractEndpoints(file)
    expect(Object.keys(result)).toEqual(["getAll", "getById"])
    expect(result.getAll).toContain("z.array(UserSchema)")
    expect(result.getById).toContain(":id")
  })

  it("returns empty map for file without endpoints", () => {
    const file = `import { defineGroup } from "@noverax/courier/define"`
    expect(extractEndpoints(file)).toEqual({})
  })
})

// ── Fingerprint: generateFingerprints ───────────────────────────────────────

describe("generateFingerprints", () => {
  it("generates fingerprints for all endpoints in file", () => {
    const file = `export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>()(http => http.get("")),
    create: endpoint<User, CreateUserVars>()((http, vars) => http.post("", vars)),
  },
})`
    const fps = generateFingerprints(file)
    expect(Object.keys(fps)).toEqual(["getAll", "create"])
    expect(fps.getAll).toMatch(/^[0-9a-f]{16}$/)
    expect(fps.create).toMatch(/^[0-9a-f]{16}$/)
  })
})

// ── Fingerprint: classifyEndpoints ──────────────────────────────────────────

describe("classifyEndpoints", () => {
  const baseCode = {
    getAll: `    getAll: endpoint<User[]>()(http => http.get(""))`,
    getById: `    getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars))`,
  }

  function makeFingerprints(code: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [name, c] of Object.entries(code)) {
      result[name] = computeHash(c)
    }
    return result
  }

  it("classifies unchanged endpoints as safe", () => {
    const stored = makeFingerprints(baseCode)
    const result = classifyEndpoints(baseCode, stored, ["getAll", "getById"])
    expect(result.endpoints.getAll).toBe("safe")
    expect(result.endpoints.getById).toBe("safe")
  })

  it("classifies modified endpoints as modified", () => {
    const stored = makeFingerprints(baseCode)
    const currentCode = {
      ...baseCode,
      getAll: `    getAll: endpoint<User[]>()(http => http.get("", { headers: { "X-Custom": "1" } }))`,
    }
    const result = classifyEndpoints(currentCode, stored, ["getAll", "getById"])
    expect(result.endpoints.getAll).toBe("modified")
    expect(result.endpoints.getById).toBe("safe")
  })

  it("classifies new spec endpoints as new", () => {
    const stored = makeFingerprints(baseCode)
    const result = classifyEndpoints(baseCode, stored, ["getAll", "getById", "create"])
    expect(result.endpoints.create).toBe("new")
  })

  it("classifies removed spec endpoints as removed", () => {
    const stored = makeFingerprints(baseCode)
    const result = classifyEndpoints(baseCode, stored, ["getAll"])
    expect(result.endpoints.getById).toBe("removed")
  })

  it("classifies user-added endpoints (not in fingerprints) as modified", () => {
    const stored = makeFingerprints({ getAll: baseCode.getAll! })
    const codeWithExtra = {
      ...baseCode,
      custom: `    custom: endpoint<void>()(http => http.post("custom"))`,
    }
    const result = classifyEndpoints(codeWithExtra, stored, ["getAll"])
    expect(result.endpoints.custom).toBe("modified")
  })

  it("detects removed + modified (user changed an endpoint that spec removed)", () => {
    const stored = makeFingerprints(baseCode)
    const modifiedCode = {
      ...baseCode,
      getById: `    getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", { ...vars, extra: true }))`,
    }
    const result = classifyEndpoints(modifiedCode, stored, ["getAll"])
    expect(result.endpoints.getById).toBe("removed")
  })
})

// ── Spec Diff ───────────────────────────────────────────────────────────────

import { makeSpec } from "./helpers/make-spec"

describe("diffSpecs", () => {
  it("detects added endpoints", () => {
    const oldSpec = makeSpec({
      groups: [{ name: "users", description: "", prefix: "/users", endpoints: [] }],
    })
    const newSpec = makeSpec({
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
          tags: ["users"],
        }],
      }],
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.added).toHaveLength(1)
    expect(diff.added[0]?.name).toBe("getAll")
    expect(diff.removed).toHaveLength(0)
  })

  it("detects removed endpoints", () => {
    const ep = {
      name: "getAll",
      operationId: null,
      httpMethod: "get" as const,
      path: "/",
      fullPath: "/users",
      description: "",
      secured: false,
      requestBody: null,
      parameters: [],
      responseSchema: null,
      tags: ["users"],
    }
    const oldSpec = makeSpec({
      groups: [{ name: "users", description: "", prefix: "/users", endpoints: [ep] }],
    })
    const newSpec = makeSpec({
      groups: [{ name: "users", description: "", prefix: "/users", endpoints: [] }],
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.removed).toHaveLength(1)
    expect(diff.removed[0]?.name).toBe("getAll")
    expect(diff.breakingChanges.some((b) => b.severity === "breaking" && b.category === "endpoint-removed")).toBe(true)
  })

  it("detects modified endpoints (method change)", () => {
    const oldEp = {
      name: "update",
      operationId: null,
      httpMethod: "put" as const,
      path: "/:id",
      fullPath: "/users/:id",
      description: "",
      secured: false,
      requestBody: null,
      parameters: [],
      responseSchema: null,
      tags: ["users"],
    }
    const newEp = { ...oldEp, httpMethod: "patch" as const }
    const oldSpec = makeSpec({
      groups: [{ name: "users", description: "", prefix: "/users", endpoints: [oldEp] }],
    })
    const newSpec = makeSpec({
      groups: [{ name: "users", description: "", prefix: "/users", endpoints: [newEp] }],
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.modified).toHaveLength(1)
    expect(diff.modified[0]?.changes).toContain("HTTP method changed: put → patch")
    expect(diff.breakingChanges.some((b) => b.category === "method-changed")).toBe(true)
  })

  it("detects added schemas as non-breaking", () => {
    const oldSpec = makeSpec({ schemas: {} })
    const newSpec = makeSpec({
      schemas: {
        User: { name: "User", type: "object", properties: { id: { type: "number", required: true } } },
      },
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.schemaChanges).toHaveLength(1)
    expect(diff.schemaChanges[0]?.type).toBe("added")
    expect(diff.breakingChanges.some((b) => b.severity === "non-breaking" && b.category === "schema-added")).toBe(true)
  })

  it("detects removed schemas as breaking", () => {
    const oldSpec = makeSpec({
      schemas: {
        User: { name: "User", type: "object", properties: { id: { type: "number", required: true } } },
      },
    })
    const newSpec = makeSpec({ schemas: {} })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.schemaChanges).toHaveLength(1)
    expect(diff.schemaChanges[0]?.type).toBe("removed")
    expect(diff.breakingChanges.some((b) => b.severity === "breaking" && b.category === "schema-removed")).toBe(true)
  })

  it("detects modified schemas (field added)", () => {
    const oldSpec = makeSpec({
      schemas: {
        User: { name: "User", type: "object", properties: { id: { type: "number", required: true } } },
      },
    })
    const newSpec = makeSpec({
      schemas: {
        User: {
          name: "User",
          type: "object",
          properties: {
            id: { type: "number", required: true },
            email: { type: "string", required: false },
          },
        },
      },
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.schemaChanges).toHaveLength(1)
    expect(diff.schemaChanges[0]?.type).toBe("modified")
    expect(diff.schemaChanges[0]?.changes).toContain("field added: email")
  })

  it("detects field type change as potentially breaking", () => {
    const oldSpec = makeSpec({
      schemas: {
        User: { name: "User", type: "object", properties: { status: { type: "string", required: true } } },
      },
    })
    const newSpec = makeSpec({
      schemas: {
        User: { name: "User", type: "object", properties: { status: { type: "number", required: true } } },
      },
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.breakingChanges.some((b) => b.severity === "potentially-breaking" && b.category === "schema-type-changed")).toBe(true)
  })

  it("returns empty diff for identical specs", () => {
    const spec = makeSpec({
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
    const diff = diffSpecs(spec, spec)
    expect(diff.added).toHaveLength(0)
    expect(diff.removed).toHaveLength(0)
    expect(diff.modified).toHaveLength(0)
    expect(diff.schemaChanges).toHaveLength(0)
  })

  it("detects path change as breaking", () => {
    const baseEp = {
      name: "getById",
      operationId: null,
      httpMethod: "get" as const,
      description: "",
      secured: false,
      requestBody: null,
      responseSchema: null,
      parameters: [],
      tags: [],
    }
    const oldSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{ ...baseEp, path: "/:id", fullPath: "/users/:id" }],
      }],
    })
    const newSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{ ...baseEp, path: "/:userId", fullPath: "/users/:userId" }],
      }],
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.modified).toHaveLength(1)
    expect(diff.modified[0]?.changes?.some((c) => c.includes("path changed"))).toBe(true)
    expect(diff.breakingChanges.some((b) => b.category === "path-changed")).toBe(true)
  })

  it("detects response type change as potentially breaking", () => {
    const baseEp = {
      name: "getAll",
      operationId: null,
      httpMethod: "get" as const,
      path: "/",
      fullPath: "/users",
      description: "",
      secured: false,
      requestBody: null,
      parameters: [],
      tags: [],
    }
    const oldSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{ ...baseEp, responseSchema: { name: "UserList", type: "array" as const, refName: "UserList" } }],
      }],
    })
    const newSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{ ...baseEp, responseSchema: { name: "UserPage", type: "object" as const, refName: "UserPage" } }],
      }],
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.modified).toHaveLength(1)
    expect(diff.modified[0]?.changes?.some((c) => c.includes("response type changed"))).toBe(true)
    expect(diff.breakingChanges.some((b) => b.category === "response-changed")).toBe(true)
  })

  it("detects request body change as potentially breaking", () => {
    const baseEp = {
      name: "create",
      operationId: null,
      httpMethod: "post" as const,
      path: "/",
      fullPath: "/users",
      description: "",
      secured: false,
      responseSchema: null,
      parameters: [],
      tags: [],
    }
    const oldSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{ ...baseEp, requestBody: { name: "CreateUser", type: "object" as const, refName: "CreateUser" } }],
      }],
    })
    const newSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{ ...baseEp, requestBody: { name: "CreateUserV2", type: "object" as const, refName: "CreateUserV2" } }],
      }],
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.modified[0]?.changes?.some((c) => c.includes("request body changed"))).toBe(true)
    expect(diff.breakingChanges.some((b) => b.category === "body-changed")).toBe(true)
  })

  it("detects security change as potentially breaking", () => {
    const baseEp = {
      name: "getAll",
      operationId: null,
      httpMethod: "get" as const,
      path: "/",
      fullPath: "/users",
      description: "",
      requestBody: null,
      responseSchema: null,
      parameters: [],
      tags: [],
    }
    const oldSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{ ...baseEp, secured: false }],
      }],
    })
    const newSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{ ...baseEp, secured: true }],
      }],
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.modified[0]?.changes?.some((c) => c.includes("security changed"))).toBe(true)
    expect(diff.breakingChanges.some((b) => b.category === "security-changed")).toBe(true)
  })

  it("detects parameter removed as breaking", () => {
    const baseEp = {
      name: "search",
      operationId: null,
      httpMethod: "get" as const,
      path: "/search",
      fullPath: "/users/search",
      description: "",
      secured: false,
      requestBody: null,
      responseSchema: null,
      tags: [],
    }
    const oldSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{
          ...baseEp,
          parameters: [
            { name: "q", in: "query" as const, required: true, type: "string", description: "" },
            { name: "limit", in: "query" as const, required: false, type: "number", description: "" },
          ],
        }],
      }],
    })
    const newSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{
          ...baseEp,
          parameters: [
            { name: "q", in: "query" as const, required: true, type: "string", description: "" },
          ],
        }],
      }],
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.modified[0]?.changes?.some((c) => c.includes("parameter removed"))).toBe(true)
    expect(diff.breakingChanges.some((b) => b.category === "parameter-removed")).toBe(true)
  })

  it("detects schema field removed as breaking", () => {
    const oldSpec = makeSpec({
      schemas: {
        User: {
          name: "User",
          type: "object",
          properties: {
            id: { type: "number", required: true },
            name: { type: "string", required: true },
            bio: { type: "string", required: false },
          },
        },
      },
    })
    const newSpec = makeSpec({
      schemas: {
        User: {
          name: "User",
          type: "object",
          properties: {
            id: { type: "number", required: true },
            name: { type: "string", required: true },
          },
        },
      },
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.schemaChanges[0]?.changes).toContain("field removed: bio")
    expect(diff.breakingChanges.some((b) => b.category === "schema-field-removed")).toBe(true)
  })

  it("detects schema field became required as potentially breaking", () => {
    const oldSpec = makeSpec({
      schemas: {
        User: {
          name: "User",
          type: "object",
          properties: { name: { type: "string", required: false } },
        },
      },
    })
    const newSpec = makeSpec({
      schemas: {
        User: {
          name: "User",
          type: "object",
          properties: { name: { type: "string", required: true } },
        },
      },
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.schemaChanges[0]?.changes?.some((c) => c.includes("became required"))).toBe(true)
    expect(diff.breakingChanges.some((b) => b.category === "schema-field-required")).toBe(true)
  })

  it("detects schema field became optional as non-breaking", () => {
    const oldSpec = makeSpec({
      schemas: {
        User: {
          name: "User",
          type: "object",
          properties: { name: { type: "string", required: true } },
        },
      },
    })
    const newSpec = makeSpec({
      schemas: {
        User: {
          name: "User",
          type: "object",
          properties: { name: { type: "string", required: false } },
        },
      },
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.schemaChanges[0]?.changes?.some((c) => c.includes("became optional"))).toBe(true)
    expect(diff.breakingChanges.some((b) => b.category === "schema-field-optional")).toBe(true)
  })

  it("classifies added endpoints as non-breaking", () => {
    const oldSpec = makeSpec({
      groups: [{ name: "users", description: "", prefix: "/users", endpoints: [] }],
    })
    const newSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{
          name: "create",
          operationId: null,
          httpMethod: "post",
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
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.breakingChanges.some((b) => b.severity === "non-breaking" && b.category === "endpoint-added")).toBe(true)
  })

  it("detects parameter changes", () => {
    const baseEp = {
      name: "getById",
      operationId: null,
      httpMethod: "get" as const,
      path: "/:id",
      fullPath: "/users/:id",
      description: "",
      secured: false,
      requestBody: null,
      responseSchema: null,
      tags: [],
    }
    const oldSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{
          ...baseEp,
          parameters: [{ name: "id", in: "path" as const, required: true, type: "string", description: "" }],
        }],
      }],
    })
    const newSpec = makeSpec({
      groups: [{
        name: "users",
        description: "",
        prefix: "/users",
        endpoints: [{
          ...baseEp,
          parameters: [
            { name: "id", in: "path" as const, required: true, type: "string", description: "" },
            { name: "fields", in: "query" as const, required: false, type: "string", description: "" },
          ],
        }],
      }],
    })
    const diff = diffSpecs(oldSpec, newSpec)
    expect(diff.modified).toHaveLength(1)
    expect(diff.modified[0]?.changes?.some((c) => c.includes("parameter added"))).toBe(true)
  })
})
