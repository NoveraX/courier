import { describe, expect, it } from "vitest"
import { mergeGroupFile } from "../src/apis/merge/merge-group"
import { mergeImports } from "../src/apis/merge/merge-imports"
import type { FingerprintResult, MergeChange } from "../src/apis/merge/types"

// ── splitEndpoint ──────────────────────────────────────────────────────────

// ── mergeImports ───────────────────────────────────────────────────────────

describe("mergeImports", () => {
  it("unions imports from same source", () => {
    const existing = [
      { raw: "", source: "@noverax/courier/define", names: ["defineGroup", "endpoint"], typeNames: [] },
      { raw: "", source: "./schemas", names: ["UserSchema"], typeNames: ["User"] },
    ]
    const generated = [
      { raw: "", source: "@noverax/courier/define", names: ["defineGroup", "endpoint"], typeNames: [] },
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
      { raw: "", source: "@noverax/courier/define", names: ["defineGroup", "endpoint"], typeNames: [] },
      { raw: "", source: "lodash", names: ["debounce"], typeNames: [] },
    ]
    const generated = [
      { raw: "", source: "@noverax/courier/define", names: ["defineGroup", "endpoint"], typeNames: [] },
    ]
    const changes: MergeChange[] = []
    const result = mergeImports(existing, generated, changes)

    expect(result.some((l) => l.includes("lodash"))).toBe(true)
    expect(changes.some((c) => c.type === "preserved" && c.target === "import:lodash")).toBe(true)
  })

  it("adds new generated imports", () => {
    const existing = [
      { raw: "", source: "@noverax/courier/define", names: ["defineGroup", "endpoint"], typeNames: [] },
    ]
    const generated = [
      { raw: "", source: "@noverax/courier/define", names: ["defineGroup", "endpoint"], typeNames: [] },
      { raw: "", source: "zod", names: ["z"], typeNames: [] },
    ]
    const changes: MergeChange[] = []
    const result = mergeImports(existing, generated, changes)

    expect(result.some((l) => l.includes("zod"))).toBe(true)
  })
})

// ── mergeGroupFile ─────────────────────────────────────────────────────────

describe("mergeGroupFile", () => {
  const baseGenerated = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
    getById: endpoint.variables<{ id: string }>().response<User>().get(":id"),
  },
});
`

  it("keeps the builder heads the file declares", () => {
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe", getById: "safe" },
      existingCode: {},
    }
    const result = mergeGroupFile(baseGenerated, baseGenerated, fingerprints)
    expect(result.content).toContain("const { endpoint } = courier();")
  })

  it("declares a head the spec has newly introduced", () => {
    const withMutation = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
    getById: endpoint.variables<{ id: string }>().response<User>().get(":id"),
    create: endpoint.response<User>().post(""),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe", getById: "safe", create: "new" },
      existingCode: {},
    }
    const result = mergeGroupFile(baseGenerated, withMutation, fingerprints)
    expect(result.content).toContain("const { endpoint } = courier();")
  })

  it("keeps a base the user renamed or configured", () => {
    const userBase = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier({ timeout: 10_000 });

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
    getById: endpoint.variables<{ id: string }>().response<User>().get(":id"),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe", getById: "safe" },
      existingCode: {},
    }
    const result = mergeGroupFile(userBase, baseGenerated, fingerprints)
    expect(result.content).toContain("const { endpoint } = courier({ timeout: 10_000 });")
  })

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

  it("keeps an endpoint the user edited, whole", () => {
    const userEdited = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.get("archive").response<User[]>(),
    getById: endpoint.get(":id").variables<{ id: string }>().response<User>(),
  },
});
`
    const newGenerated = `import { courier, defineGroup } from "@noverax/courier/define";
import { z } from "zod";
import { UserSchema } from "./schemas";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.get("").response(z.array(UserSchema)),
    getById: endpoint.get(":id").variables<{ id: string }>().response<User>(),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "modified", getById: "safe" },
      existingCode: {},
    }
    const result = mergeGroupFile(userEdited, newGenerated, fingerprints)

    expect(result.status).toBe("merged")
    /* An endpoint is one expression now: the edit stays, whole. */
    expect(result.content).toContain('getAll: endpoint.get("archive")')
    expect(result.content).not.toContain("z.array(UserSchema)")
    /* One nobody touched is taken from the spec. */
    expect(result.content).toContain('getById: endpoint.get(":id")')
    expect(result.changes).toContainEqual(
      expect.objectContaining({ type: "preserved", target: "endpoint:getAll" }),
    )
  })

  it("adds new endpoints from spec", () => {
    const existing = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
  },
});
`
    const generated = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
    create: endpoint.variables<CreateUserVars>().response<User>().post(""),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe", create: "new" },
      existingCode: {},
    }
    const result = mergeGroupFile(existing, generated, fingerprints)
    expect(result.content).toContain("create:")
    expect(result.content).toContain('create: endpoint.variables<CreateUserVars>()')
    expect(result.changes.some((c) => c.type === "added" && c.target === "endpoint:create")).toBe(true)
  })

  it("preserves user-added endpoints not in spec", () => {
    const existingWithCustom = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
    myCustom: endpoint.post("custom"),
  },
});
`
    const generated = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe" },
      existingCode: {},
    }
    const result = mergeGroupFile(existingWithCustom, generated, fingerprints)
    expect(result.content).toContain("myCustom:")
    expect(result.content).toContain('endpoint.post("custom")')
    expect(result.changes.some((c) => c.type === "preserved" && c.target === "endpoint:myCustom")).toBe(true)
  })

  it("preserves user imports during merge", () => {
    const existingWithExtraImport = `import { courier, defineGroup } from "@noverax/courier/define";
import { debounce } from "lodash";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
  },
});
`
    const generated = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
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
    const existingWithHelper = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
  },
});

export function transformUsers(users: User[]) {
  return users.filter(u => u.active);
}
`
    const generated = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
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
    const existing = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    /** Old description */
    getAll: endpoint.response<User[]>().get(""),
  },
});
`
    const generated = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    /** New updated description */
    getAll: endpoint.response<User[]>().get(""),
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

  it("preserves removed-from-spec endpoint when it exists in user file", () => {
    const existing = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
    getById: endpoint.variables<{ id: string }>().response<User>().get(":id"),
  },
});
`
    /* New spec removed getById — generated only has getAll */
    const generated = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe" },
      existingCode: {},
    }
    const result = mergeGroupFile(existing, generated, fingerprints)
    /* getById should be preserved as user-added */
    expect(result.content).toContain("getById:")
    expect(result.content).toContain("getById: endpoint")
    expect(result.changes.some((c) => c.type === "preserved" && c.target === "endpoint:getById")).toBe(true)
  })

  it("produces consistent output format with 2-space indent", () => {
    const existing = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().get(""),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe" },
      existingCode: {},
    }
    const result = mergeGroupFile(existing, existing, fingerprints)
    /* Verify structural lines use 2-space indent */
    expect(result.content).toContain("export const users = defineGroup({")
    expect(result.content).toContain('  prefix: "/users",')
    expect(result.content).toContain("  endpoints: {")
    expect(result.content).toContain("  },")
    expect(result.content).toContain("});")
  })

  it("handles endpoint with complex multi-line body as modified", () => {
    const existing = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response<User[]>().via(((http) => {
      const res = http.get("")
      return res
    })).reads(),
});
`
    const generated = `import { courier, defineGroup } from "@noverax/courier/define";
import { z } from "zod";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.response(z.array(z.object({}))).get(""),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "modified" },
      existingCode: {},
    }
    const result = mergeGroupFile(existing, generated, fingerprints)
    expect(result.content).toContain("getAll:")
    expect(result.status).toBe("merged")
    expect(result.changes.some((c) => c.type === "preserved" && c.target === "endpoint:getAll")).toBe(true)
  })
})
