import { describe, expect, it } from "vitest"
import { mergeGroupFile } from "../src/apis/merge/merge-group"
import { parseExistingGroup } from "../src/apis/merge/parse-existing"
import type { FingerprintResult } from "../src/apis/merge/types"

const GENERATED = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
  },
});
`

/** A base configured across several lines closes a bracket of its own. */
const MULTILINE_BASE = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier({
  timeout: 10_000,
});

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.via((http) => http.get("", { page: 1 })).response<User[]>().reads(),
  },
});

export function byId(users: User[], id: string): User | undefined {
  return users.find((u) => u.id === id);
}
`

describe("a base configured across several lines", () => {
  it("is not mistaken for the end of the group", () => {
    const parsed = parseExistingGroup(MULTILINE_BASE)

    expect(parsed.preamble.join("\n")).toContain("timeout: 10_000")
    expect(parsed.trailingCode.join("\n")).toContain("export function byId")
    expect(parsed.trailingCode.join("\n")).not.toContain("defineGroup")
  })

  it("does not duplicate the group through the merge", () => {
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "modified" },
      existingCode: {},
    }
    const { content } = mergeGroupFile(MULTILINE_BASE, GENERATED, fingerprints)

    expect(content.match(/defineGroup\(/g)).toHaveLength(1)
    expect(content).toContain("timeout: 10_000")
    expect(content).toContain("export function byId")
    expect(content).toContain("{ page: 1 }")
  })
})

describe("a file whose endpoint bodies are untouched", () => {
  const SPEC_GREW = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    create: endpoint.post("").response<User>(),
  },
});
`

  it("keeps the base, the extra imports and the helpers below it", () => {
    const USER_EDITED = `import { courier, defineGroup } from "@noverax/courier/define";
import { logger } from "../logger";

const { endpoint } = courier({ timeout: 10_000 });

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
  },
});

export function byId(users: User[], id: string): User | undefined {
  logger.debug(id);
  return users.find((u) => u.id === id);
}
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe", create: "new" },
      existingCode: {},
    }
    const { content } = mergeGroupFile(USER_EDITED, SPEC_GREW, fingerprints)

    expect(content).toContain("timeout: 10_000")
    expect(content).toContain('from "../logger"')
    expect(content).toContain("export function byId")
    expect(content).toContain('create: endpoint.post("").response<User>()')
    expect(content).toContain("const { endpoint } = courier({ timeout: 10_000 });")
  })

  it("drops an endpoint the spec no longer describes", () => {
    const HAS_RETIRED = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    retired: endpoint.get("retired").response<User>(),
    mine: endpoint.get("mine").response<User>(),
  },
});
`
    const fingerprints: FingerprintResult = {
      endpoints: { getAll: "safe", retired: "removed", mine: "modified" },
      existingCode: {},
    }
    const { content, changes } = mergeGroupFile(HAS_RETIRED, GENERATED, fingerprints)

    expect(content).not.toContain("retired:")
    expect(content).toContain("mine:")
    expect(changes).toContainEqual(
      expect.objectContaining({ type: "removed", target: "endpoint:retired" }),
    )
  })
})
