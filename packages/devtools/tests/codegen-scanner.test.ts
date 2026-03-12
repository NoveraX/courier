import { describe, expect, it } from "vitest"

import { extractEndpoints } from "../src/codegen/scanner/scan-endpoint"
import { extractGroups, extractSource, isNexusFile } from "../src/codegen/scanner/scan-source"

describe("scanner", () => {
  describe("isNexusFile", () => {
    it("detects defineApi", () => {
      expect(isNexusFile(`const api = defineApi({ baseURL: "" })`)).toBe(true)
    })

    it("detects defineGroup", () => {
      expect(isNexusFile(`const users = defineGroup({ prefix: "users" })`)).toBe(true)
    })

    it("rejects unrelated files", () => {
      expect(isNexusFile(`import { useState } from "react"`)).toBe(false)
    })
  })

  describe("extractSource", () => {
    it("extracts defineApi info", () => {
      const content = `
import { defineApi } from "@noverax/nexus/define"
export const timeweb = defineApi({
  baseURL: "https://api.timeweb.cloud",
  groups: { users },
})
`
      const result = extractSource(content, "src/api/timeweb/source.ts")
      expect(result).toMatchObject({
        name: "timeweb",
        baseURL: "https://api.timeweb.cloud",
        filePath: "src/api/timeweb/source.ts",
      })
    })

    it("returns null for non-source files", () => {
      expect(extractSource(`const x = 1`, "foo.ts")).toBeNull()
    })

    it("detects createCaller", () => {
      const content = `
const api = defineApi({ baseURL: "/api" })
export const client = createCaller(api)
`
      const result = extractSource(content, "api.ts")
      expect(result?.hasClient).toBe(true)
    })

    it("detects createProxyCaller", () => {
      const content = `
const api = defineApi({ baseURL: "/api" })
export const client = createProxyCaller(api)
`
      const result = extractSource(content, "api.ts")
      expect(result?.hasClient).toBe(true)
    })

    it("extracts inline endpoints from defineApi", () => {
      const content = `
export const api = defineApi({
  baseURL: "/api",
  groups: { users },
  endpoints: {
    health: endpoint({ type: "query" })((http) => http.get("/health")),
  }
})
`
      const result = extractSource(content, "api.ts")
      expect(result?.inlineEndpoints).toHaveLength(1)
      expect(result?.inlineEndpoints?.[0]?.name).toBe("health")
    })
  })

  describe("extractGroups (single)", () => {
    it("extracts defineGroup info", () => {
      const content = `
import { defineGroup, endpoint } from "@noverax/nexus/define"
export const users = defineGroup({
  prefix: "/api/v1/users",
  endpoints: {
    getAll: endpoint<User[]>({ type: "query" })((http) => http.get("")),
    getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars)),
  },
})
`
      const result = extractGroups(content, "src/api/users/index.ts")[0]
      expect(result).toMatchObject({
        name: "users",
        prefix: "/api/v1/users",
        filePath: "src/api/users/index.ts",
      })
      expect(result!.endpoints.length).toBe(2)
    })

    it("returns empty array for non-group files", () => {
      expect(extractGroups(`const x = 1`, "foo.ts")).toHaveLength(0)
    })
  })

  describe("extractGroups (multiple)", () => {
    it("extracts all defineGroup calls from a single file", () => {
      const content = `
const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint({ response: z.array(UserSchema), type: "query" })(
      (http) => http.get(),
    ),
  },
})

const posts = defineGroup({
  prefix: "posts",
  endpoints: {
    getAll: endpoint({ response: z.array(PostSchema), type: "query" })(
      (http) => http.get(),
    ),
    create: endpoint({
      response: PostSchema,
      variables: CreatePostSchema,
      type: "mutation",
    })((http, vars) => http.post("", vars)),
  },
})
`
      const groups = extractGroups(content, "api.ts")
      expect(groups).toHaveLength(2)
      expect(groups[0]?.name).toBe("users")
      expect(groups[0]?.endpoints).toHaveLength(1)
      expect(groups[1]?.name).toBe("posts")
      expect(groups[1]?.endpoints).toHaveLength(2)
    })
  })

  describe("extractEndpoints", () => {
    it("extracts endpoint with generics and config", () => {
      const block = `{
    getAll: endpoint<User[]>({ response: UserSchema, type: "query" })((http) => http.get("users")),
    create: endpoint<User, CreateUserInput>({ response: UserSchema, variables: CreateUserSchema })((http, vars) => http.post("users", vars)),
  }`
      const result = extractEndpoints(block)
      expect(result).toHaveLength(2)

      expect(result[0]).toMatchObject({
        name: "getAll",
        analysis: {
          hasResponseType: true,
          hasVariablesType: false,
          hasValidation: true,
          httpMethod: "get",
          path: "users",
          type: "query",
        },
      })

      expect(result[1]).toMatchObject({
        name: "create",
        analysis: {
          hasResponseType: true,
          hasVariablesType: true,
          hasValidation: true,
          httpMethod: "post",
          path: "users",
          type: null,
        },
      })
    })

    it("handles endpoint without generics or config", () => {
      const block = `{
    deleteAll: endpoint()((http) => http.del("users")),
  }`
      const result = extractEndpoints(block)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        name: "deleteAll",
        analysis: {
          hasResponseType: false,
          hasVariablesType: false,
          hasValidation: false,
          httpMethod: "delete",
          path: "users",
        },
      })
    })

    it("handles patch and put methods", () => {
      const block = `{
    update: endpoint<User, UpdateUser>()((http, vars) => http.put("users/:id", vars)),
    patch: endpoint<User, PatchUser>()((http, vars) => http.patch("users/:id", vars)),
  }`
      const result = extractEndpoints(block)
      expect(result).toHaveLength(2)
      expect(result[0]!.analysis.httpMethod).toBe("put")
      expect(result[1]!.analysis.httpMethod).toBe("patch")
    })

    it("handles multiline endpoint with nested braces", () => {
      const block = `{
    getAll: endpoint({ response: z.array(UserSchema), type: "query" })(
      (http) => http.get(),
    ),
    getById: endpoint({
      response: UserSchema,
      variables: z.object({ id: z.number() }),
      type: "query",
    })((http, vars) => http.get(":id", vars)),
  }`
      const result = extractEndpoints(block)
      expect(result).toHaveLength(2)

      expect(result[0]).toMatchObject({
        name: "getAll",
        analysis: {
          hasResponseType: true,
          hasValidation: true,
          httpMethod: "get",
          path: "",
          type: "query",
        },
      })

      expect(result[1]).toMatchObject({
        name: "getById",
        analysis: {
          hasResponseType: true,
          hasVariablesType: true,
          hasValidation: true,
          httpMethod: "get",
          path: ":id",
          type: "query",
        },
      })
    })

    it("handles http.get() with no path argument", () => {
      const block = `{
    list: endpoint({ type: "query" })((http) => http.get()),
  }`
      const result = extractEndpoints(block)
      expect(result).toHaveLength(1)
      expect(result[0]!.analysis.path).toBe("")
      expect(result[0]!.analysis.httpMethod).toBe("get")
    })

    it("detects validation from response/variables in config", () => {
      const block = `{
    create: endpoint({
      response: PostSchema,
      variables: CreatePostSchema,
      type: "mutation",
    })((http, vars) => http.post("", vars)),
  }`
      const result = extractEndpoints(block)
      expect(result).toHaveLength(1)
      expect(result[0]!.analysis.hasValidation).toBe(true)
      expect(result[0]!.analysis.hasResponseType).toBe(true)
      expect(result[0]!.analysis.hasVariablesType).toBe(true)
      expect(result[0]!.analysis.type).toBe("mutation")
    })
  })
})
