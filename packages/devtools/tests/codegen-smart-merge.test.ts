import { describe, expect, it } from "vitest"
import { mergeGroupFile } from "../src/codegen/merge/merge-group"
import { mergeImports } from "../src/codegen/merge/merge-imports"
import { parseExistingGroup } from "../src/codegen/merge/parse-existing"
import { splitEndpoint } from "../src/codegen/merge/split-endpoint"
import type { FingerprintResult, MergeChange } from "../src/codegen/merge/types"

// ── splitEndpoint ──────────────────────────────────────────────────────────

describe("splitEndpoint", () => {
  it("splits single-line endpoint into head and body", () => {
    const code = `    getAll: endpoint<User[]>()((http) => http.get("")),`
    const parts = splitEndpoint(code)
    expect(parts).not.toBeNull()
    expect(parts!.head).toBe("    getAll: endpoint<User[]>()")
    expect(parts!.body).toBe(`((http) => http.get("")),`)
  })

  it("splits endpoint with config object", () => {
    const code = `    getAll: endpoint<User[]>({ response: z.array(UserSchema) })((http) => http.get("")),`
    const parts = splitEndpoint(code)
    expect(parts!.head).toBe("    getAll: endpoint<User[]>({ response: z.array(UserSchema) })")
    expect(parts!.body).toBe(`((http) => http.get("")),`)
  })

  it("splits multi-line endpoint", () => {
    const code = `    getAll: endpoint<User[]>({
      response: z.array(UserSchema),
    })((http) => http.get("")),`
    const parts = splitEndpoint(code)
    expect(parts!.head).toContain("z.array(UserSchema)")
    expect(parts!.head.endsWith("})")).toBe(true)
    expect(parts!.body.startsWith("((http)")).toBe(true)
  })

  it("returns null for non-endpoint code", () => {
    expect(splitEndpoint("const x = 42")).toBeNull()
  })

  it("handles endpoint with two generic params", () => {
    const code = `    getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars)),`
    const parts = splitEndpoint(code)
    expect(parts!.head).toBe("    getById: endpoint<User, { id: string }>()")
    expect(parts!.body).toBe(`((http, vars) => http.get(":id", vars)),`)
  })
})

// ── parseExistingGroup ─────────────────────────────────────────────────────

describe("parseExistingGroup", () => {
  const sampleFile = `import { defineGroup, endpoint } from "@noverax/nexus/define";
import { z } from "zod";
import { UserSchema, type User } from "./schemas";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    /** Get all users */
    getAll: endpoint<User[]>({ response: z.array(UserSchema) })((http) => http.get("")),
    getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars)),
  },
});
`

  it("extracts group name and prefix", () => {
    const info = parseExistingGroup(sampleFile)
    expect(info.groupName).toBe("users")
    expect(info.prefix).toBe("/users")
  })

  it("extracts imports", () => {
    const info = parseExistingGroup(sampleFile)
    expect(info.imports).toHaveLength(3)
    expect(info.imports[0]!.names).toContain("defineGroup")
    expect(info.imports[0]!.names).toContain("endpoint")
    expect(info.imports[1]!.namespaceImport).toBeUndefined()
    expect(info.imports[1]!.source).toBe("zod")
    expect(info.imports[2]!.names).toContain("UserSchema")
    expect(info.imports[2]!.typeNames).toContain("User")
  })

  it("extracts endpoints with comments", () => {
    const info = parseExistingGroup(sampleFile)
    expect(info.endpoints).toHaveLength(2)
    expect(info.endpoints[0]!.name).toBe("getAll")
    expect(info.endpoints[0]!.comment).toContain("Get all users")
    expect(info.endpoints[1]!.name).toBe("getById")
    expect(info.endpoints[1]!.comment).toBeUndefined()
  })

  it("extracts namespace imports", () => {
    const file = `import * as v from "valibot";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {},
});
`
    const info = parseExistingGroup(file)
    expect(info.imports[0]!.namespaceImport).toBe("v")
    expect(info.imports[0]!.source).toBe("valibot")
  })

  it("extracts trailing code after defineGroup", () => {
    const file = `import { defineGroup, endpoint } from "@noverax/nexus/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {},
});

export function customHelper() {
  return "user code";
}
`
    const info = parseExistingGroup(file)
    expect(info.trailingCode.length).toBeGreaterThan(0)
    expect(info.trailingCode.join("\n")).toContain("customHelper")
  })
})

// ── mergeImports ───────────────────────────────────────────────────────────

describe("mergeImports", () => {
  it("unions imports from same source", () => {
    const existing = [
      { raw: "", source: "@noverax/nexus/define", names: ["defineGroup", "endpoint"], typeNames: [] },
      { raw: "", source: "./schemas", names: ["UserSchema"], typeNames: ["User"] },
    ]
    const generated = [
      { raw: "", source: "@noverax/nexus/define", names: ["defineGroup", "endpoint"], typeNames: [] },
      { raw: "", source: "./schemas", names: ["UserSchema", "PostSchema"], typeNames: ["User", "Post"] },
    ]
    const changes: MergeChange[] = []
    const result = mergeImports(existing, generated, changes)

    const schemasLine = result.find((l) => l.includes("./schemas"))!
    expect(schemasLine).toContain("UserSchema")
    expect(schemasLine).toContain("PostSchema")
    expect(schemasLine).toContain("type User")
    expect(schemasLine).toContain("type Post")
  })

  it("preserves user-added imports", () => {
    const existing = [
      { raw: "", source: "@noverax/nexus/define", names: ["defineGroup", "endpoint"], typeNames: [] },
      { raw: "", source: "lodash", names: ["debounce"], typeNames: [] },
    ]
    const generated = [
      { raw: "", source: "@noverax/nexus/define", names: ["defineGroup", "endpoint"], typeNames: [] },
    ]
    const changes: MergeChange[] = []
    const result = mergeImports(existing, generated, changes)

    expect(result.some((l) => l.includes("lodash"))).toBe(true)
    expect(changes.some((c) => c.type === "preserved" && c.target === "import:lodash")).toBe(true)
  })

  it("adds new generated imports", () => {
    const existing = [
      { raw: "", source: "@noverax/nexus/define", names: ["defineGroup", "endpoint"], typeNames: [] },
    ]
    const generated = [
      { raw: "", source: "@noverax/nexus/define", names: ["defineGroup", "endpoint"], typeNames: [] },
      { raw: "", source: "zod", names: ["z"], typeNames: [] },
    ]
    const changes: MergeChange[] = []
    const result = mergeImports(existing, generated, changes)

    expect(result.some((l) => l.includes("zod"))).toBe(true)
  })
})

// ── mergeGroupFile ─────────────────────────────────────────────────────────

describe("mergeGroupFile", () => {
  const baseGenerated = `import { defineGroup, endpoint } from "@noverax/nexus/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>()((http) => http.get("")),
    getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars)),
  },
});
`

  it("safe overwrite when no user changes", () => {
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe", getById: "safe" },
      existingCode: {},
    }
    const result = mergeGroupFile(baseGenerated, baseGenerated, fingerprints)
    expect(result.status).toBe("safe")
    expect(result.content).toContain("getAll")
    expect(result.content).toContain("getById")
  })

  it("preserves user body for modified endpoints", () => {
    const existingWithUserCode = `import { defineGroup, endpoint } from "@noverax/nexus/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>()((http) => http.get("", { headers: { "X-Custom": "true" } })),
    getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars)),
  },
});
`
    const newGenerated = `import { defineGroup, endpoint } from "@noverax/nexus/define";
import { z } from "zod";
import { UserSchema } from "./schemas";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>({ response: z.array(UserSchema) })((http) => http.get("")),
    getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars)),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "modified", getById: "safe" },
      existingCode: {},
    }
    const result = mergeGroupFile(existingWithUserCode, newGenerated, fingerprints)
    expect(result.status).toBe("merged")
    /* New config (with schema) should be applied */
    expect(result.content).toContain("z.array(UserSchema)")
    /* User's custom header should be preserved in body */
    expect(result.content).toContain("X-Custom")
    expect(result.changes.some((c) => c.type === "preserved" && c.target === "endpoint:getAll")).toBe(true)
  })

  it("adds new endpoints from spec", () => {
    const existing = `import { defineGroup, endpoint } from "@noverax/nexus/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>()((http) => http.get("")),
  },
});
`
    const generated = `import { defineGroup, endpoint } from "@noverax/nexus/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>()((http) => http.get("")),
    create: endpoint<User, CreateUserVars>()((http, vars) => http.post("", vars)),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe", create: "new" },
      existingCode: {},
    }
    const result = mergeGroupFile(existing, generated, fingerprints)
    expect(result.content).toContain("create:")
    expect(result.content).toContain("http.post")
    expect(result.changes.some((c) => c.type === "added" && c.target === "endpoint:create")).toBe(true)
  })

  it("preserves user-added endpoints not in spec", () => {
    const existingWithCustom = `import { defineGroup, endpoint } from "@noverax/nexus/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>()((http) => http.get("")),
    myCustom: endpoint<void>()((http) => http.post("custom")),
  },
});
`
    const generated = `import { defineGroup, endpoint } from "@noverax/nexus/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>()((http) => http.get("")),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe" },
      existingCode: {},
    }
    const result = mergeGroupFile(existingWithCustom, generated, fingerprints)
    expect(result.content).toContain("myCustom:")
    expect(result.content).toContain('http.post("custom")')
    expect(result.changes.some((c) => c.type === "preserved" && c.target === "endpoint:myCustom")).toBe(true)
  })

  it("preserves user imports during merge", () => {
    const existingWithExtraImport = `import { defineGroup, endpoint } from "@noverax/nexus/define";
import { debounce } from "lodash";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>()((http) => http.get("")),
  },
});
`
    const generated = `import { defineGroup, endpoint } from "@noverax/nexus/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>()((http) => http.get("")),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe" },
      existingCode: {},
    }
    const result = mergeGroupFile(existingWithExtraImport, generated, fingerprints)
    expect(result.content).toContain("lodash")
  })

  it("preserves trailing user code after defineGroup", () => {
    const existingWithHelper = `import { defineGroup, endpoint } from "@noverax/nexus/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>()((http) => http.get("")),
  },
});

export function transformUsers(users: User[]) {
  return users.filter(u => u.active);
}
`
    const generated = `import { defineGroup, endpoint } from "@noverax/nexus/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint<User[]>()((http) => http.get("")),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe" },
      existingCode: {},
    }
    const result = mergeGroupFile(existingWithHelper, generated, fingerprints)
    expect(result.content).toContain("transformUsers")
  })

  it("updates JSDoc comments from new spec", () => {
    const existing = `import { defineGroup, endpoint } from "@noverax/nexus/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    /** Old description */
    getAll: endpoint<User[]>()((http) => http.get("")),
  },
});
`
    const generated = `import { defineGroup, endpoint } from "@noverax/nexus/define";

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    /** New updated description */
    getAll: endpoint<User[]>()((http) => http.get("")),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe" },
      existingCode: {},
    }
    const result = mergeGroupFile(existing, generated, fingerprints)
    expect(result.content).toContain("New updated description")
    expect(result.content).not.toContain("Old description")
  })
})
